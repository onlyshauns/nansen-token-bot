import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  type Interaction,
  type Message,
} from 'discord.js';
import type { NansenClient } from '../nansen/client.js';
import { parseUserInput, isTokenQuery } from '../core/parser.js';
import { resolveToken } from '../core/resolver.js';
import { buildTokenReport } from '../core/lookup.js';
import { toDiscordEmbed } from './render.js';

export async function startDiscord(
  token: string,
  clientId: string,
  nansen: NansenClient
): Promise<void> {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  // Register slash commands
  const rest = new REST({ version: '10' }).setToken(token);
  const commands = [
    new SlashCommandBuilder()
      .setName('token')
      .setDescription('Look up a token by symbol or contract address')
      .addStringOption((opt) =>
        opt.setName('query').setDescription('Token symbol ($PEPE) or contract address').setRequired(true)
      )
      .toJSON(),
  ];

  try {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('[Discord] Slash commands registered');
  } catch (error) {
    console.error('[Discord] Failed to register slash commands:', error);
  }

  // Handle slash commands
  client.on('interactionCreate', async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'token') return;

    const query = interaction.options.getString('query', true);
    await handleSlashCommand(interaction, query, nansen);
  });

  // Handle $SYMBOL and CA in messages
  client.on('messageCreate', async (message: Message) => {
    if (message.author.bot) return;
    if (!isTokenQuery(message.content)) return;
    await handleMessage(message, nansen);
  });

  client.on('ready', () => {
    console.log(`[Discord] Bot ready as ${client.user?.tag}`);
  });

  client.on('error', (error) => {
    console.error('[Discord] Client error:', error);
  });

  console.log('[Discord] Bot starting...');
  await client.login(token);
}

async function handleSlashCommand(
  interaction: Interaction & { isChatInputCommand(): boolean },
  rawQuery: string,
  nansen: NansenClient
): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const parsed = parseUserInput(rawQuery);
  if (!parsed) {
    await interaction.reply({ content: 'Invalid query. Try $PEPE or a contract address.', ephemeral: true });
    return;
  }

  // Defer since API calls take time
  await interaction.deferReply();

  try {
    const token = await resolveToken(parsed, nansen);
    const report = await buildTokenReport(token, nansen);
    const embed = toDiscordEmbed(report);
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await interaction.editReply({
      content: `\u274C Could not look up "${parsed.query}"\n\n${message}\n\nTry using the contract address directly.`,
    });
  }
}

async function handleMessage(message: Message, nansen: NansenClient): Promise<void> {
  const parsed = parseUserInput(message.content);
  if (!parsed) return;

  try {
    // Show typing indicator
    if ('sendTyping' in message.channel) {
      await message.channel.sendTyping();
    }

    const token = await resolveToken(parsed, nansen);
    const report = await buildTokenReport(token, nansen);
    const embed = toDiscordEmbed(report);
    await message.reply({ embeds: [embed] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    await message.reply(`\u274C Could not look up "${parsed.query}" — ${msg}`);
  }
}
