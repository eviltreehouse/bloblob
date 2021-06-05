'use strict';
const { URLSearchParams } = require('url');
const request = require('simple-get');

const API_EP_MESSAGES = 'https://api.pushover.net/1/messages.json';
const NO_POST = process.env['PO_SIMULATE']; // For local integration testing

const targetError = (target, msg) => {
	const err = new Error(msg);
	err.target = target;

	return err;
}

// "private" methods
const postToApi = Symbol();
const generateUrl = Symbol();

class Bloblob {
	/**
	 * @param {string} [appToken] your Pushover.net application token
	 */
	constructor(appToken) {
		if (typeof appToken === 'string') this.appToken = appToken;
	}

	/**
	 * Transmit a message to a single user token, along with an optional
	 * title.
	 * @param {string} userToken
	 * @param {string} message
	 * @param {string} [title]
	 * @param {string} [device]
	 * @returns {Promise<string>}
	 */
	async lob(userToken, message, title, device) {
		if (! this.appToken) throw new Error('No application token!');
		if (! userToken) throw new Error('No user token provided!');
		if (! message) throw new Error('No message!');

		return this[postToApi](userToken, message, title, device);
	}

	/**
	 * Helper function to transmit a message to a list of user tokens, 
	 * along with an optional title. Does not provide a `device` specification, 
	 * use `.lob()` if you need that level of precision.
	 * Will resolve with a mixed array of either message ID strings for successes,
	 * or `Error` objects for any that went wrong. These error objects will have 
	 * a `.target` property to associate them with the specific message attempt.
	 * @param {string} userToken
	 * @param {string} message
	 * @param {string} [title]
	 * @returns {Promise<any[]>}
	 */
	async lobToAll(userTokens, message, title) {
		const pms = [];

		for (let user of userTokens) {
			pms.push(this[postToApi](user, message, title))
		}

		return allPromisesSettled(pms);
	}

	/**
	 * @param {string} target
	 * @param {string} message
	 * @param {string} [title]
	 * @param {string} [device]
	 * @returns {Promise<string>}
	 */
	[postToApi](target, message, title, device) {
		const _error = targetError.bind(null, target);

		return new Promise((resolve, reject) => {
			if (message.length > 1024) return reject(_error('Message is too long'));
			const url = this[generateUrl](target, message, title, device);

			if (NO_POST) {
				// just fake it with some delay
				console.log(`[.] Was going to POST to -> ${url}`);
				setTimeout(() => {
					resolve('01234567-8888-9999-0000-deadbeefcafe');
				}, Math.random()*1000);

				return;
			}

			request.concat({
				url,
				method: 'POST',
				body: '',
			}, (err, res, data) => {
				const strData = data.toString('utf8');

				if (err) return reject(err);

				if (res.statusCode !== 200) {
					const json = JSON.parse(strData);
					return reject(_error(`HTTP ${res.statusCode}: ${json.errors.join(' ')}`))
				}

				try {
					const json = JSON.parse(strData);
					resolve(json.request);
				} catch(err) {
					return reject(_error(`Response from pushover.net is malformed? ${strData}`));
				}
			})
		})
	}


	/**
	 * @param {string} userToken
	 * @param {string} message
	 * @param {string} [title]
	 * @param {string} [device]
	 * @return {string}
	 */
	[generateUrl](userToken, message, title, device) {
		const params = {
			token: this.appToken,
			user: userToken,
			message,
		};

		if (typeof title === 'string' && title.length > 0) params.title = title;
		if (typeof device === 'string' && title.length > 0) params.device = device;

		const str_params = (new URLSearchParams(
			Object.keys(params).map(k => [ k, params[k] ])
		)).toString();

		return `${API_EP_MESSAGES}?${str_params}`;
	}
}

module.exports = Bloblob;

/** Quick n' easy "integration test" */
if (require.main === module) {
	let hasCustomMessage = true;

	if (process.stdin.isTTY) {
		console.error('[?] No custom message content: Pipe your message in via STDIN');
		hasCustomMessage = false;
	}

	const APP_TOKEN = process.env['PO_APP_TOKEN'];
	const USER_TOKENS = process.argv.slice(2);

	if (! APP_TOKEN) {
		console.error('[!] No application token set as PO_APP_TOKEN in the env!');
		process.exit(1);
	} else if (! USER_TOKENS.length) {
		console.error('[!] No user targets provided as script arguments!');
		process.exit(1);
	}

	let msg = '';
	if (hasCustomMessage) {
		// siphon in message text
		process.stdin.on('data', (chunk) => {
			msg += chunk;
		});
	}

	const execute = () => {
		const bb = new Bloblob(APP_TOKEN);
		const payloadString = `Hey from BlobLob! 🚀:\n${msg || '<no message>'}`;
		if (USER_TOKENS.length === 1) {
			bb.lob(USER_TOKENS[0], payloadString, 'Welcome', 'iphone')
				.then(console.log, console.error)
		} else {
			bb.lobToAll(USER_TOKENS, payloadString)
				.then(console.log, console.error)
		}
	};

	if (hasCustomMessage) process.stdin.on('end', execute);
	else execute();
}

/**
 * Shim version of `.allSettled`
 * @param {Promise[]} promiseList 
 * @returns {Promise<any>[]}
 */
function allPromisesSettled(promiseList) {
	let results = new Array(promiseList.length);

	return new Promise((ok) => {
		let fillAndCheck = function(i) {
			return function(ret) {
				results[i] = ret;

				for(let j = 0; j < results.length; j++) {
					if (results[j] == null) return;
				}

				ok(results);
			}
		};

		for (let i = 0; i <promiseList.length; i++) {
			promiseList[i].then(fillAndCheck(i), fillAndCheck(i));
		}
	});
}