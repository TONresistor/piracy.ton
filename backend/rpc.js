import { TonClient } from '@ton/ton';
import db from './db.js';

const reserve = db.transaction((interval, time) => {
    const row = db.prepare('SELECT * FROM rpc_budget WHERE id=1').get();
    const next = Math.max(time, row.next_at, row.cooldown_until);
    if (next - time > 5000) throw new Error('rpc_busy');
    db.prepare('UPDATE rpc_budget SET next_at=? WHERE id=1').run(next + interval);
    return next;
});
let pending = 0;
export async function scheduleRpc(operation) {
    if (pending >= 16) throw new Error('rpc_busy');
    pending++;
    try {
        const configured = Number(process.env.TON_RPC_MIN_INTERVAL_MS ?? 500);
        const interval = Number.isFinite(configured) ? Math.max(100, configured) : 500;
        const time = Date.now();
        const next = reserve.immediate(interval, time);
        if (next > time) await new Promise(resolve => setTimeout(resolve, next - time));
        // Respect a provider cooldown discovered by the other process while waiting.
        if (db.prepare('SELECT cooldown_until FROM rpc_budget WHERE id=1').get().cooldown_until > Date.now()) throw new Error('rpc_cooldown');
        return await operation();
    } catch (error) {
        if (error.response?.status === 429) {
            const seconds = Number(error.response.headers?.['retry-after']);
            const until = Date.now() + (Number.isFinite(seconds) && seconds > 0 ? Math.max(2000, seconds * 1000) : 5000);
            db.prepare('UPDATE rpc_budget SET cooldown_until=MAX(cooldown_until,?) WHERE id=1').run(until);
        }
        throw error;
    } finally { pending--; }
}
export function createTonClient(parameters) {
    const methods = new Set(['runMethod', 'getContractState', 'getTransactions', 'tryLocateResultTx']);
    return new Proxy(new TonClient(parameters), {
        get(target, key, receiver) {
            const value = Reflect.get(target, key, receiver);
            if (methods.has(key)) return (...args) => scheduleRpc(() => value.apply(receiver, args));
            return typeof value === 'function' ? value.bind(receiver) : value;
        }
    });
}
