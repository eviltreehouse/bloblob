'use strict';
const { URLSearchParams } = require('url');
const request = require('simple-get');

const API_EP_MESSAGES = 'https://api.pushover.net/1/messages.json';
const NO_POST = true; /** for testing */

class Bloblob {
	/**
	 * @param {string} [appToken] your application token
	 */
	constructor(appToken) {
		if (typeof appToken === 'string') this.appToken = appToken;
	}

	async lob(userToken, message, title) {
		if (! this.appToken) throw new Error('No application token!');
		if (! userToken) throw new Error('No user token provided!');
		if (! message) throw new Error('No message!');

		return await this.postToApi(userToken, message, title);
	}

	async lobToAll(userTokens, message, title) {
		const pms = [];

		for (let user of userTokens) {
			pms.push(this.postToApi(user, message, title))
		}

		/** @todo handle sporadic error conditions */
		return allPromisesSettled(pms);
	}

	/**
	 *
	 * @param {string} target
	 * @param {string} message
	 * @param {string} title
	 * @returns {Promise<string>}
	 */
	postToApi(target, message, title) {
		return new Promise((resolve, reject) => {
			if (message.length > 1024) return reject(new Error('Message is too long'));
			const url = this.generatePostURL(target, message, title);

			if (NO_POST) {
				// just fake it
				console.log(`[.] Was going to POST to -> ${url}`);
				setTimeout(() => {
					resolve('01234567-3218-41af-83d8-fedcba987654');
				}, 400);

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
					return reject(new Error(`HTTP ${res.statusCode}: ${json.errors.join(' ')}`))
				}

				try {
					const json = JSON.parse(strData);
					resolve(json.request);
				} catch(err) {
					return reject(new Error('Response malformed?'));
				}
			})
		})
	}


	/**
	 * @param {string} userToken
	 * @param {string} message
	 * @param {string} [title]
	 * @return {string}
	 */
	generatePostURL(userToken, message, title) {
		const params = {
			token: this.appToken,
			user: userToken,
			message,
		};

		if (typeof title === 'string') params.title = title;

		const str_params = (new URLSearchParams(
			Object.keys(params).map(k => [ k, params[k] ])
		)).toString();

		return `${API_EP_MESSAGES}?${str_params}`;
	}
}

module.exports = Bloblob;

/** @testing */
if (require.main === module) {
	if (process.stdin.isTTY) {
		console.error('[!] No message content: Pipe your message to this module via STDIN');
		process.exit(1);
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
	process.stdin.on('data', (chunk) => {
		msg += chunk;
	});

	process.stdin.on('end', () => {
		const bb = new Bloblob(APP_TOKEN);
		bb.lobToAll(USER_TOKENS, 'Hey from BlobLob! 🚀')
			.then(console.log, console.error)

	});
}

function allPromisesSettled(promiseList) {
	let results = new Array(promiseList.length);

	return new Promise((ok, rej) => {
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