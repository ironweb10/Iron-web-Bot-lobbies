const { bot_invite_status, cid, bid, level, banner, bot_invite_onlinetype, bot_use_status, bot_use_onlinetype, bot_join_message, bot_leave_time, eid } = require('./config');

const axiosInstance = require('axios').default;
const system = require('os');
const { Client: botClientClass, ClientOptions, Enums, Party } = require('fnbr');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { allowedPlaylists, websocketHeaders } = require('../utils/constants');
const WebhookClientWrapper = require('../utils/webhookClient');
const webhookClient = new WebhookClientWrapper();
require('colors');
const { google } = require('youtube-api-v3-search');

const logEnabled = true;
const fetchVersion = require('../utils/version');

/**
 * @typedef {import('./utils/types').MMSTicket} MMSTicket
 * @typedef {import('./utils/types').PartyMatchmakingInfo} PartyMatchmakingInfo
 */

(async () => {
  const currentVersion = await fetchVersion();
  const platformType = system.platform() === "win32" ? "Windows" : system.platform();
  const userAgentString = `Fortnite/${currentVersion.replace('-Windows', '')} ${platformType}/${system.release()}`;

  axiosInstance.defaults.headers["user-agent"] = userAgentString;
  console.log("UserAgent set to", axiosInstance.defaults.headers["user-agent"]);

  let accountsObject = [];
  let accounts = [];
 
  const numberOfAccounts = Object.keys(process.env).filter(key => key.startsWith('ACCOUNT') && key.includes('_ID')).length;
  const halfOfAccounts = Math.floor(numberOfAccounts / 2); 
  console.log(`Number of accounts (bots) detected: ${halfOfAccounts}`);
  
  for (let i = 1; i <= numberOfAccounts; i++) {
    const accountId = process.env[`ACCOUNT${i}_ID`];
    const deviceId = process.env[`ACCOUNT${i}_DEVICE_ID`];
    const secret = process.env[`ACCOUNT${i}_SECRET`];
  
    if (accountId && deviceId && secret) {
      accounts.push({
        accountId,
        deviceId,
        secret,
      });
    }
  }
                                                                                                                                                                                                                                                                          //Made by iron web10: dsc.gg/iron-web10

  /**
   * @type {ClientOptions}
   */
  for (const deviceAuth of accounts) {

    const botClient = new botClientClass({
      defaultStatus: "Launching Kali Linux...",
      auth: { deviceAuth },
      debug: console.log,
      xmppDebug: false,
      platform: 'WIN',
      partyConfig: {
        chatEnabled: true,
        maxSize: 4,
      },
    });
    global.botClient = botClient;

 
    await botClient.login();
    console.log(`[LOGS] Logged in as ${botClient.user.self.displayName}`);
    webhookClient.send(`\`\`\`diff\n+ ${botClient.user.self.displayName} Online.\`\`\``);
    
    const partyInstance = botClient.party;
    botClient.setStatus(bot_invite_status);
    await botClient.party.me.setOutfit(cid);
    await botClient.party.setPrivacy(Enums.PartyPrivacy.PRIVATE);
    await botClient.party.me.setLevel(level);
    await botClient.party.me.setBanner(banner);
    if (bid && typeof bid === 'string' && bid.trim() !== '' && bid !== 'None') {
      await botClient.party.me.setBackpack(bid).catch((e) => console.warn('[WARN] setBackpack failed:', e.message));
    }
  
  axiosInstance.interceptors.response.use(undefined, function (error) {
    if (error.response) {
      if (error.response.data.errorCode && botClient && botClient.party) {
        botClient.party.sendMessage(`HTTP Error: ${error.response.status} ${error.response.data.errorCode} ${error.response.data.errorMessage}`);
      }
      console.error(error.response.status, error.response.data);
    }
    return error;
  });

  let isMatchmakingActive = false;

  const commandFiles = fs.readdirSync(path.join(__dirname, '..', 'lobbycommands')).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const command = require(path.join(__dirname, '..', 'lobbycommands', file));
    botClient.on('friend:message', msg => command(msg, msg.author));
  }

 botClient.on('party:updated', async (updatedParty) => {
  try {
    const partyState = updatedParty?.meta?.schema?.["Default:PartyState_s"];
    if (!partyState) return;

   

    const matchmakingInfo = updatedParty.meta.schema["Default:PartyMatchmakingInfo_j"];
    const parsedMatchmakingInfo = matchmakingInfo ? JSON.parse(matchmakingInfo).PartyMatchmakingInfo : null;
    const isActuallyMatchmaking = parsedMatchmakingInfo?.playlistName && 
                                 parsedMatchmakingInfo?.sessionId && 
                                 parsedMatchmakingInfo?.buildId;

    switch (partyState) {
      case "BattleRoyalePreloading": {
        try {
          const requestData = {
            delete: [],
            revision: 2,
            update: {
              'Default:LobbyState_j': {
                "LobbyState": { "hasPreloadedAthena": true }
              }
            }
          };
          
          await botClient.party.me.sendPatch(requestData).catch(() => {});
        } catch (e) {
          console.error("Error in Preloading state:", e);
        }
        break;
      }
      case "BattleRoyaleMatchmaking": {
        if (isMatchmakingActive) return;

        isMatchmakingActive = true;
       
        
        const matchmakingInfo = updatedParty.meta.schema["Default:PartyMatchmakingInfo_j"];
        if (!matchmakingInfo) return;

        try {
          const matchmakingDetails = JSON.parse(matchmakingInfo).PartyMatchmakingInfo;
          const playlist = matchmakingDetails?.playlistName?.toLowerCase();
          if (!playlist || !allowedPlaylists.includes(playlist)) {
            console.log("Unsupported playlist", playlist);
            webhookClient?.send(`\`\`\`diff\n- [BOT ${'client'.yellow}] [Matchmaking] Unsupported playlist: ${playlist}\`\`\``).catch(() => {});
            botClient.party.me.setReadiness(false).catch(() => {});
            return;
          }

          const partyMembersReady = botClient.party.members.filter(m => m.isReady).map(m => m.id).join(',');
          const matchId = `${matchmakingDetails.buildId}:${matchmakingDetails.playlistRevision}:${matchmakingDetails.regionId}:${playlist}`;
          const searchParams = new URLSearchParams({
            "partyPlayerIds": partyMembersReady,
            "player.platform": "Windows",
            "player.option.partyId": botClient.party.id,
            "input.KBM": "true",
            "player.input": "KBM",
            "bucketId": matchId
          });

          botClient.party.members.filter(m => m.isReady).forEach(member => {
            try {
              const platformData = member.meta.get("Default:PlatformData_j");
              if (platformData && !searchParams.has(`party.${platformData}`)) {
                searchParams.append(`party.${platformData}`, "true");
              }
            } catch {}
          });

          const authToken = botClient.auth.sessions.get("fortnite").accessToken;
          const ticketResponse = await axiosInstance.get(
            `https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/game/v2/matchmakingservice/ticket/player/${botClient.user.self.id}?${searchParams}`,
            { headers: { Accept: 'application/json', Authorization: `Bearer ${authToken}` } }
          );

          if (ticketResponse.status !== 200) throw new Error("Invalid ticket response");

          const ticketData = ticketResponse.data;
          const hashResponse = await axiosInstance.post("https://api-xji1.onrender.com/generate-checksum", ticketData, {
            headers: { Accept: 'application/json' }
          });

          const checksum = hashResponse?.data?.checksum;
          if (!checksum) {
            webhookClient.send(`\`\`\`diff\n- [BOT ${'client'.yellow}] [Matchmaking] Error: No checksum returned from API (Support:dsc.gg/pulsarfn)\`\`\``);
            botClient.party.me.setReadiness(true).catch(() => {});
            return;
          }

          const MMSAuthHeaders = [
            "Epic-Signed", ticketData.ticketType, ticketData.payload, ticketData.signature, checksum
          ];

          const matchmakingSocket = new WebSocket(ticketData.serviceUrl, {
            perMessageDeflate: false,
            rejectUnauthorized: false,
            headers: {
              Origin: ticketData.serviceUrl.replace('ws', 'http'),
              Authorization: MMSAuthHeaders.join(" "),
              ...websocketHeaders
            }
          });

          matchmakingSocket.on('unexpected-response', handleMatchmakingError);

          if (logEnabled) {
            matchmakingSocket.on('close', () => {
              console.log(`[BOT ${'client'.yellow}] [Matchmaking] Connection closed`);
              webhookClient.send(`\`\`\`diff\n+ [BOT ${'client'.yellow}] [Matchmaking] Matchmaking connection closed\`\`\``);
            });
          }

         

          let partyTooBigHandled = false;

          matchmakingSocket.on('message', async (msg) => {
            try {
              const message = JSON.parse(msg);
          
              if (logEnabled) {
                console.log(`[BOT ${'client'.yellow}] [Matchmaking] Message from matchmaker`, message);
              }
          
              if (!partyTooBigHandled &&
                  message.name === 'Error' &&
                  message.payload?.code === 4207 &&
                  message.payload?.reason === 'player.party_too_big.207') {
                
                partyTooBigHandled = true;
          
                const emoteId = 'EID_RedCard';
                botClient.party.me.setEmote(emoteId).catch(console.error);
                botClient.party.chat.send("Error!");
               
                botClient.party.setSize(3).catch(console.error);
          
                const size = botClient.party.size;
                let recommendedMode = '';
          
                if (size === 2) {
                  recommendedMode = 'duos';
                } else if (size === 3) {
                  recommendedMode = 'trios';
                } else if (size === 4) {
                  recommendedMode = 'squads';
                }
          
                if (recommendedMode) {
                  botClient.party.chat.send(`Please put this option: ${recommendedMode}.`);
                }
          
                setTimeout(() => {
                  botClient.party.me.setReadiness(true).catch(console.error);
                }, 5000);
              }
            } catch (err) {
              console.error("Error parsing matchmaking message:", err);
            }
          });
          
          

        } catch (error) {
          console.error(`[BOT ${'client'.yellow}] Error during matchmaking:`, error);
          webhookClient?.send(`\`\`\`diff\n- [BOT ${'client'.yellow}] [Matchmaking] Error during matchmaking process\`\`\``).catch(() => {});
          isMatchmakingActive = false;
        }
        break;
      }

      case "BattleRoyalePostMatchmaking": {
        if (!isActuallyMatchmaking) {
          
          return;
        }

        if (logEnabled) {
          console.log(`[BOT ${'client'.yellow}] [Party] Players entering match, leaving party`);
          webhookClient.send(`\`\`\`diff\n+ [BOT ${'client'.yellow}] [Party] Players entering match, leaving party\`\`\``);
        }
        isMatchmakingActive = false;
        botClient.party.leave().catch(() => {});
        break;
      }

      case "BattleRoyaleView": {
        
        break;
      }

      default: {
        if (logEnabled) {
          console.log(`[BOT ${'client'.yellow}] [Party] Unknown PartyState: ${partyState}`);
        }
        break;
      }
    }
  } catch (err) {
    console.error(`[BOT ${'client'.yellow}] Unexpected error in party:updated`, err);
  }
});

  async function handleMatchmakingError(request, response) {
    let errorData = '';
    response.on('data', (chunk) => errorData += chunk);
    response.on('end', () => {
      const baseMessage = `[${'Matchmaking'.cyan}] Error: ${response.statusCode} ${response.statusMessage}`;
      botClient.party.chat.send(baseMessage);

      if (errorData === '') {
        console.error(baseMessage);
      } else if (response.headers['content-type'].startsWith('application/json')) {
        const jsonResponse = JSON.parse(errorData);
        console.error(`${baseMessage}, ${jsonResponse.errorCode} ${jsonResponse.errorMessage || ''}`);
        botClient.party.chat.send(`${baseMessage}, ${jsonResponse.errorCode} ${jsonResponse.errorMessage || ''}`);
      } else {
        console.error(`${baseMessage} response body: ${errorData}`);
      }
    });
  }

  botClient.on("party:member:updated", async (member) => {
    if (member.id == botClient.user.id) return;

    if (!botClient.party.me) return;

    if ((member.isReady && (botClient?.party?.me?.isLeader || member.isLeader) && !botClient.party?.me?.isReady) && !botClient.party.bManualReady) {
      // Ready Up
      if (botClient.party?.me?.isLeader) {
        await member.promote();
      }
      botClient.party.me.setReadiness(true);
    } else if ((!member.isReady && member.isLeader) && !botClient.party.bManualReady) {
      try {
        botClient.WSS.close();
      } catch { }
      botClient.party.me.setReadiness(false);
    }

    let allMembersReady = true;

    botClient.party.members.forEach(member => {
      if (!allMembersReady) return;
      allMembersReady = member.isReady;
    });
  });

  botClient.on('friend:request', async (request) => {
    console.log(`[${'client'.yellow}]`, `Received a friend request from ${request.displayName} ${request.id}`);
    await request.accept();
    console.log(`[${'client'.yellow}]`, `Accepted friend request from ${request.displayName} ${request.id}`);
    webhookClient.send(`\`\`\`diff\n- [Bot] Accepted friend request from ${request.displayName} ${request.id}\`\`\``);
  });

  botClient.on('party:invite', async (request) => {
    const party = botClient.party;  
    if (party.size === 1) {
      await request.accept();
    } else {
      await request.decline();
    }
  });

  const sendWebhook = (msg) => webhookClient.send(`\`\`\`diff\n${msg}\`\`\``);
  botClient.on('party:member:joined', async (join) => {
    botClient.party.me.sendPatch({'Default:FORTStats_j': '{\"FORTStats\":{\"fortitude\":3000,\"offense\":3000,\"resistance\":3000,\"tech\":3000,\"teamFortitude\":3000,\"teamOffense\":3000,\"teamResistance\":3000,\"teamTech\":3000,\"fortitude_Phoenix\":3000,\"offense_Phoenix\":3000,\"resistance_Phoenix\":3000,\"tech_Phoenix\":3000,\"teamFortitude_Phoenix\":3000,\"teamOffense_Phoenix\":3000,\"teamResistance_Phoenix\":3000,\"teamTech_Phoenix\":3000}}'})
    await botClient.party.me.setEmote(eid)
    managePartySize();
    await botClient.party.me.setOutfit(cid);
  });

  const managePartySize = () => {
    const messages = {
      1: [bot_invite_status, bot_invite_onlinetype, "PRIVATE", false, "Time has stopped!"], 
      2: [bot_use_status, bot_use_onlinetype, "", false, bot_join_message], 
      3: [bot_use_status, bot_use_onlinetype, "", false, bot_join_message],
      4: [bot_use_status, bot_use_onlinetype, "", false, bot_join_message],
    };

    const statusDetails = messages[botClient.party.size];

    if (statusDetails) {
      if (botClient.party.size > 1 || botClient.party.size === 1 && statusDetails[0]) {
        botClient.setStatus(statusDetails[0], statusDetails[1]);
      }
      if (statusDetails[2]) botClient.party.setPrivacy(Enums.PartyPrivacy[statusDetails[2]]);
      if (botClient.party?.me?.isReady && statusDetails[3] !== undefined) {
        botClient.party.me.setReadiness(statusDetails[3]);
      }
      if (botClient.party.size > 1 && statusDetails[4]) {
        botClient.party.chat.send(`${statusDetails[4]}\n Support server: dsc.gg/pulsarfn`);
      }
    }
  };

  const handleLeaveTimer = async () => {
    const party = botClient.party;  
    botClient.party.chat.send("Timer ended!");
    await sleep(1.2);
    botClient.party.leave();
    sendWebhook(`${botClient.user.self.displayName} Time tracking has stopped!`);
    timerstatus = false;
  };

  if (botClient.party.size !== 1) {  // Fixed this line
    sendWebhook(`- BOT ${botClient.user.self.displayName} And The player to leave: ${member.displayName}`);
    sendWebhook(`${botClient.user.self.displayName} Time has begun!`);  
    this.ID = setTimeout(handleLeaveTimer, bot_leave_time);  
    timerstatus = true;
    sendWebhook(`- BOT ${botClient.user.self.displayName} And The player to leave: ${member.displayName}`);
    sendWebhook(`+ Bot ${botClient.user.self.displayName} joined`);
  }

  managePartySize();

  botClient.on('party:member:left', async (member) => {
    sendWebhook(`- BOT ${botClient.user.self.displayName} And The player to leave: ${member.displayName}`);
    managePartySize();
  });


}


//Discord Bot



  const { Client: Dclient, Intents, MessageEmbed } = require('discord.js');

const chalk = require('chalk');

const { discord_status_type, discord_status, run_discord_client } = require('./config');

function initializeDiscordBot() {
    const dclient = new Dclient({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });

    dclient.commands = new Map();

    dclient.once('ready', () => {
        console.log(chalk.blue("[DISCORD] Bot online!"));
        dclient.user.setActivity(discord_status, { type: discord_status_type });

        const commands = [];
        const commandsPath = path.join(__dirname, './../DiscordBotCommands');
        
        fs.readdirSync(commandsPath).forEach(file => {
            const command = require(path.join(commandsPath, file));
            if (command.data && command.execute) {
                dclient.commands.set(command.data.name, command);  
                commands.push(command.data.toJSON());
            }
        });

        dclient.application.commands.set(commands)
            .then(() => {
                console.log(chalk.blue("[DISCORD] Commands refreshed!"));
            })
            .catch((error) => {
                console.error(chalk.red("[DISCORD] Error refreshing commands: "), error);
            });
    });

    dclient.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const command = dclient.commands.get(interaction.commandName); 

    if (!command) {
        const embed = new MessageEmbed()
            .setColor('#FF0000')
            .setTitle('Error')
            .setDescription('Unknown command.');
        return interaction.reply({ embeds: [embed] });
    }

    try {
 
        await command.execute(interaction, botClient);
    } catch (error) {
        console.error(error);
        const embed = new MessageEmbed()
            .setColor('#FF0000')
            .setTitle('Error')
            .setDescription('There was an error executing the command.');
        return interaction.reply({ embeds: [embed] });
    }
});


    if (run_discord_client) {
        dclient.login(process.env.DISCORD_TOKEN);
    } else {
        console.log(chalk.blue("[DISCORD] Client disabled."));
    }
}

initializeDiscordBot();

})();
