//Magic Eight Bot (Discord Version) script
//Author: Ian Johnson
//Free software and all that, just say where you got it from

/*TODO:
 * Look at other TODOs in code
 * Remove commits and re-commit to make sure there isn't any sensitive data in the commit chain. BACK STUFF UP FIRST!!!
 * !addmeme overhaul (Done for now)
 * !removememe
 * !addreact, !removereact, !viewreact
 * More code overhaul (file splitup, etc)
 * Get linter setup
 * package.json update
 */


//Discord.js stuff
const { Client, Intents, CommandInteractionOptionResolver } = require('discord.js');
const client = new Client({intents: ['GUILDS', 'GUILD_MESSAGES']});

//file stuff
const fs = require('fs');	//file-reading stuff
const MEME_DELIMITER = String.fromCharCode(0x1E);	//Delimit each meme with a record separator ASCII character. This should be uncommon enough to not appear in any memes added
var fd;				//File descriptor (See if different ones should be used for reading and writing to prevent locking)
var buffer = [];		//Used for reading data from streams

const responses = [
	'It is certain',
	'It is decidedly so',
	'Without a doubt',
	'Yes, definitely',
	'You may rely on it',
	'As I see it, yes',
	'Most likely',
	'Outlook good',
	'Yes',
	'Signs point to yes',
	'Reply hazy try again',
	'Ask again later',
	'Better not tell you now',
	'Cannot predict now',
	'Concentrate and ask again',
	'Don\'t count on it',
	'My reply is no',
	'My sources say no',
	'Outlook not so good',
	'Very doubtful'];

const fortunes = [
	'Extremely lucky',
	'Very lucky',
	'Lucky',
	'Slightly lucky',
	'You make your luck today',
	'Slightly unlucky',
	'Unlucky',
	'Very unlucky',
	'Extremely unlucky'];


//First thing we need to do is get the token
fs.readFile('token.txt', 'utf-8', (err, data) => {
	if (err) throw err;
	else {
		let token = data.substring(0, data.length - 1);
		client.login(token);
	}
});


function setUpMemeGuildSubfolders() {
	//Make sure the root meme folder exists, create it if it doesnt
	fs.access('memes/', fs.constants.R_OK | fs.constants.W_OK, err => {
		if (err) {
			fs.mkdir('memes/', err => {
				if (err) throw err;
			});
		}
	});

	//Make sure meme subfolders for all guilds exist
	let i = 0;
	for (let g of client.guilds.cache.map(guild => guild.id)) {
		//Open the meme subfolder for this guild or create it if it doesn't exist
		fs.access(`memes/${g}/`, fs.constants.R_OK | fs.constants.W_OK, err => {
			if (err) {
				fs.mkdir(`memes/${g}/`, err => {
					if (err) throw err;
				});
			}
		});
	}
}


client.once('ready', () => {
	//setUpMemeGuildSubfolders();
	const onlineTime = new Date();
	console.log(`Bot online @ ${onlineTime.getTime()}`);
});


function memeHandler(gid, callback) {
	//Open meme guild subfolder
	//Get a list of the available files, pick a random one, open it
	//Get list of meme deliminter indices, pick a random one, return the meme at that location
	fs.readdir(`memes/${gid}/`, (err, files) => {
		if (err) return callback(err);

		fs.readFile(`memes/${gid}/${files[Math.floor(Math.random() * files.length)]}`, 'utf-8', (err, data) => {
			if (err) {
				if (err.code != 'ENOENT')
					return callback(err);
				else
					return callback(null, '');
			}

			//I think for now these files will be manageable enough to read the entirety of one
			let meme_list = data.split(MEME_DELIMITER);
			callback(null, meme_list == [] ? '' : meme_list[Math.floor(Math.random() * meme_list.length)]);
		});
	});
}


function getMemeDelimiterIndices(meme_list) {
	//We need to know where the beginning and end of the list is, so we'll add those ourselves
	let meme_delimiter_indices = [0];
	let i = 0;
	for (const c of meme_list) {
		if (c === MEME_DELIMITER)
			meme_delimiter_indices.push(i);
		i++;
	}
	meme_delimiter_indices.push(meme_list.length);
	return meme_delimiter_indices;
}


function getMemeDBSize(gid, callback) {
	let currMemeDBSize = 0;
	fs.readdir(`memes/${gid}/`, (err, files) => {
		if (err) return callback(err, -1);
		let i = 0;
		files.forEach((file) => {
			//There's surely a better way to handle this, would probably be cleaner with promises/async
			//But the basic idea is that we avoid synchronous IO, but only return once every file has been confirmed stat'd
			fs.stat(`memes/${gid}/${file}`, (err2, stats) => {
				if (err2) return callback(err2, -1);
				currMemeDBSize += stats.size;	//Should be <256Kb, will check with size of new meme
				i++;
				if (i == files.length)
					return callback(null, currMemeDBSize);
			});
		});
	});
}


//0 - Meme added, 1 - Meme already in list, 2 - Adding meme would go over DB size for guild, -1 - something bad happened
function addMemeHandler(gid, meme, callback) {
	//To pretend for one second that more than 5 servers will ever use this, let's impose a 256kB limit for now on how much meme text there can be.
	//Feel like manually getting the size of a guild's meme DB should be cheap, but if it's ever an issue,
		//we could have a JSON file with the current size to read from, and update it when a meme is added
	getMemeDBSize(gid, (err, currMemeDBSize) => {
		if (err) return callback(err, -1);

		//console.log(`Current DB size is ${currMemeDBSize} bytes`);

		//Open meme guild subfolder, then the file associated with the first byte of the meme
		fs.readFile(`memes/${gid}/${meme.toString().charCodeAt(0)}`, 'utf-8', (err, data) => {
			//^ Probably needs more work, just parse the byte to a decimal integer string
			if (err) {
				if (err.code === 'ENOENT') {
					//If file doesn't exist, we can just create it, put the meme in there and call it a day
					if (currMemeDBSize + meme.length > (256 * 1024))
						return callback(null, 2);		//We could probably have a file that maps guild IDs to how many bytes of meme data they're allowed to have

					fs.writeFile(`memes/${gid}/${meme.toString().charCodeAt(0)}`, meme, (err) => {
						if (err) return callback(err, -1);
						return callback(null, 0);
					});
				}
				else
					return callback(err, -1);
			}
			else {
				//If file does exist, we can binary search until either we find it, or we don't in which case we insert it at the final index
				//Read the file to get the meme delimiter indices
				let meme_delimiter_indices = getMemeDelimiterIndices(data);
				let start = 0, end = meme_delimiter_indices.length - 2;		//We want to ignore the last delim position when searching since it's the end of the file
				let mid = 0, pos = 0;	//determines, if we need to add the meme, whether to put it ahead of or behing the index

				while (start <= end) {
					mid = Math.floor((start + end) / 2);
					//Deal with some edge cases related to delimiters at the beginning and end of the meme list
					let a = (mid == 0 ? meme_delimiter_indices[mid] : meme_delimiter_indices[mid] + 1);
					let b = meme_delimiter_indices[mid + 1];
					let meme_check = data.slice(a, b);
					if (meme === meme_check) {
						return callback(null, 1);		//Meme's already in the list
					}
					else if (meme < meme_check) {
						end = mid - 1;
						pos = 0;
					}
					else {
						start = mid + 1;
						pos = 1;
					}
				}

				//At this point, the meme isn't in the list, so we'll add it to whever the search left mid at
				//Inserting the meme into the middle of the file is apparently more complicated since there's no fseek() equivalent
				//Since file sizes should all be manageable, we'll just do array work and write it all as one thing
				let new_meme_data = data.substring(0, meme_delimiter_indices[mid + pos]);	//Everything before new meme
				let meme_data_after_insert = (start == 0 ? data : data.slice(meme_delimiter_indices[mid + pos] + 1));
				if (mid + pos != 0)
					new_meme_data = new_meme_data.concat(MEME_DELIMITER);
				new_meme_data = new_meme_data.concat(meme);
				if (meme_data_after_insert != '') {
					new_meme_data = new_meme_data.concat(MEME_DELIMITER, meme_data_after_insert);
				}

				fs.open(`memes/${gid}/${meme.toString().charCodeAt(0)}`, 'w+', (err, fd) => {
					if (err) return callback(err, -1);
					fs.write(fd, new_meme_data, (err, written, str) => {
						if (err) return callback(err, -1);
						fs.close(fd, (err) => { if (err) return callback(err, -1) });
						return callback(null, 0);
					});
				});
			}
		});
	});
}


client.on('messageCreate', message => {
	//DEBUG: log data to console
	//console.log(`Message received from guild ${message.guild.id}`);

	//randomly reply with funny emotes, for comedic effect
	//TODO: More general list of emote reacts for each server, instead of hard-coding like this. Each should have a uniform chance of being chosen
		//If we can access the list of custom emotes, maybe just select from that actually
		//But maybe add the ability to add general emotes too, if the server so chooses
	if (message.channel.guild == 612430900000718850 && Math.floor(Math.random() * 50) == 0) {
		switch (Math.floor(Math.random() * 2)) {
		case 0:
			message.channel.send('<:virgin:612839782019629086>');
			break;
		case 1:
			message.channel.send('<:chad:612839780106895390>');
			break;
		}
	}

	//asking the bot a question, only respond if we were @'d
	if (message.mentions.users.first() != undefined) {
		if (message.mentions.users.first().username === 'magiceightbot') {
			switch (Math.floor(Math.random() * 2)) {
			case 0:
				message.channel.send('Let me see...');
				break;
			case 1:
				message.channel.send('Hmmmmm...');
				break;
			}

			message.channel.send(responses[Math.floor(Math.random() * responses.length)]);
		}
	}
	//roll command
	else if (message.content.substring(0, 5) === '!roll') {
		//TODO: Garbage rolls like "NaN" with number args like "2e2" are still possible, so this needs more work
		roll_command = message.content.split(' '); //put the command and its arguments in an array
		//The first (and only) argument of the array should be the number of digits generated (1-9, 9 by default)
		if (roll_command.length == 1)
			message.channel.send(Math.round(Math.random() * 1000000000).toString());
		else if (roll_command.length == 2) {
			let roll_count = parseInt(roll_command[1]);
			if (roll_count != NaN && roll_count >= 1 && roll_count < 10)
				message.channel.send(Math.round(Math.random() * (Math.pow(10, roll_command[1]))).toString());
		}
	}
	//meme command
	else if (message.content === '!meme') {
		memeHandler(message.guild.id, (err, meme) => {
			if (err) throw err;
			else if (meme != '')
				message.channel.send(meme);
			else
				message.channel.send('**Nothing here yet...**');
		});
	}
	//add meme command
	else if (message.content.length >= 9 && message.content.substring(0, 8) === '!addmeme') {
		if (message.content.includes(MEME_DELIMITER) == 1)
			message.channel.send('Meme contains illegal character and has been ignored');
		else {
			let memeinquestion = message.content.substring(9, message.content.length);
			addMemeHandler(message.guild.id, memeinquestion, (err, ret) => {
				if (err) {
					message.channel.send('**Something inconceivable happened (check log)**');
					throw err;
				}
				else {
					switch (ret) {
					case 0:
						message.channel.send(`\"${memeinquestion}\" has been added to the list`);
						break;
					case 1:
						message.channel.send(`\"${memeinquestion}\" is already in the list`);
						break;
					case 2:
						message.channel.send(`**Server will be over its 256KB data limit, so meme has been ignored**`);
						break;
					default:
						message.channel.send(`**Something inconceivable happened (${ret})**`);
						break;
					}
				}
			});
		}
	}
	//fortune command
	else if (message.content === '!fortune')
		message.reply(`Your fortune for today is:\n**${fortunes[Math.floor(Math.random() * fortunes.length)]}**`);
	//developer !test command to make sure binary search on strings works as intended
	else if (message.content === '!test') {
		//TODO: Seems to be working, but still need to test rigorously with each subfolder on each guild
	}
});


client.on('guildCreate', guild => {
	//Create meme subfolder, add meme DB size to file, create emote react file
	fs.mkdir(`memes/${guild.id}/`, err => { if (err) throw err; });
});


client.on('guildDelete', guild => {
	//Remove meme data and any other data we have that's associated with the guild
	fs.rmdir(`memes/${guild.id}/`, (err) => { if (err) throw err; });
});


//TODO: Does this capture any error that we may not have caught? (Should do this to avoid undefined behavior)
client.on('error', error => {
	console.log(error);
	process.kill(process.pid, 'SIGTERM');
});
