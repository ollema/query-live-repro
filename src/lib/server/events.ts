import { EventEmitter } from 'node:events';

const emitter = new EventEmitter();
emitter.setMaxListeners(256);

let counter = 0;

export const counterEvents = {
	subscribe(listener: () => void) {
		emitter.on('bump', listener);
		return () => emitter.off('bump', listener);
	},
	bump() {
		counter += 1;
		emitter.emit('bump');
	}
};

export function getCounter() {
	return counter;
}
