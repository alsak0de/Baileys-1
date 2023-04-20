/* REDIS VERSION FOR MULTI AUTH FILE STATE STORING by alsak0de, a modification from original Baileys file store

The code assume two environment variables for redis port and redis server url.
Adapt the code to your server or use the environment variables.
It also uses a variable called clientid that represents a unique identifier to the credentials you are storing.

The read & write functions parameters have not been changed to ensure full compatibility.

*/

import { createClient, RedisClient } from 'redis';
import { promisify } from 'util';
import { proto } from '../../WAProto'
import { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from '../Types';
import { initAuthCreds } from './auth-utils';
import { BufferJSON } from './generics';

const redisport = process.env.redisport || 6379
const redisurl = process.env.redisurl || "service-redis-keys.default"

const client: RedisClient = createClient({
  port: redisport,
  host: redisurl,
  family: 4,
  db: 0,
});

const getAsync = promisify(client.get).bind(client);
const setAsync = promisify(client.set).bind(client);
const delAsync = promisify(client.del).bind(client);

const getKey = (clientid: string, file: string) => {
  return `${clientid}-${file}`;
}

export const useMultiFileAuthState = async (clientid: string): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }> => {

  const writeData = async (data: any, file: string) => {
    const key = getKey(clientid, file);
    return setAsync(key, JSON.stringify(data, BufferJSON.replacer));
  }

  const readData = async (file: string) => {
    const key = getKey(clientid, file);
    const data = await getAsync(key);
    return data ? JSON.parse(data, BufferJSON.reviver) : null;
  }

  const removeData = async (file: string) => {
    const key = getKey(clientid, file);
    await delAsync(key);
  }

  const creds: AuthenticationCreds = await readData('creds.json') || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [_: string]: SignalDataTypeMap[typeof type] } = { }
          await Promise.all(
            ids.map(
              async id => {
                let value = await readData(`${type}-${id}.json`);
                if (type === 'app-state-sync-key' && value) {
                  value = proto.Message.AppStateSyncKeyData.fromObject(value);
                }

                data[id] = value;
              }
            )
          )

          return data;
        },
        set: async (data) => {
          const tasks: Promise<void>[] = []
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id]
              const file = `${category}-${id}.json`
              tasks.push(value ? writeData(value, file) : removeData(file))
            }
          }

          await Promise.all(tasks)
        }
      }
    },
    saveCreds: () => {
      return writeData(creds, 'creds.json')
    }
  }
}
