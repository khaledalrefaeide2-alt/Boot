'use strict';

const TelegramBot = require('node-telegram-bot-api');
const { getConfig } = require('./config');

const token = getConfig().TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Command handlers
const { handleCommands } = require('./handlers/commands');
// Message handlers
const { handleMessages } = require('./handlers/messages');

bot.onText(/\/start/, handleCommands);
bot.on('message', handleMessages);

console.log('Bot is running...');
