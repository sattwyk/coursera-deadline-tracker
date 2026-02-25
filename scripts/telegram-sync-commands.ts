type BotCommand = {
  command: string;
  description: string;
};

type Scope = { type: "default" } | { type: "all_private_chats" } | { type: "all_group_chats" };

type SetMyCommandsBody = {
  commands: BotCommand[];
  scope?: Scope;
  language_code?: string;
};

async function callTelegram(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} failed (HTTP ${res.status}): ${text}`);
  }

  const json = text ? (JSON.parse(text) as { ok?: boolean; description?: string }) : {};
  if (!json.ok) {
    throw new Error(`${method} returned not ok: ${json.description ?? text}`);
  }
}

async function setMyCommands(token: string, payload: SetMyCommandsBody): Promise<void> {
  await callTelegram(token, "setMyCommands", payload as unknown as Record<string, unknown>);
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim() ?? "";
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

async function main(): Promise<void> {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");

  const privateCommandsEn: BotCommand[] = [
    { command: "start", description: "Start bot and link account" },
    { command: "help", description: "Show help and command list" },
    { command: "status", description: "Show sync status and settings" },
    { command: "list", description: "List deadlines by filter" },
    { command: "settings", description: "Show current settings" },
    { command: "pause", description: "Pause notifications" },
    { command: "resume", description: "Resume notifications" },
    { command: "mode", description: "Set notify mode (all/new/changed/none)" },
    { command: "tz", description: "Set timezone (IANA)" },
    { command: "sync", description: "Run sync now" },
    { command: "test", description: "Send test response" },
  ];

  const privateCommandsHi: BotCommand[] = [
    { command: "start", description: "Bot shuru karein aur account link karein" },
    { command: "help", description: "Help aur command list dikhayen" },
    { command: "status", description: "Sync status aur settings dikhayen" },
    { command: "list", description: "Filter ke saath deadlines list karein" },
    { command: "settings", description: "Current settings dikhayen" },
    { command: "pause", description: "Notifications pause karein" },
    { command: "resume", description: "Notifications resume karein" },
    { command: "mode", description: "Notify mode set karein" },
    { command: "tz", description: "Timezone set karein" },
    { command: "sync", description: "Abhi sync chalayein" },
    { command: "test", description: "Test response bhejen" },
  ];

  const privateCommandsEs: BotCommand[] = [
    { command: "start", description: "Iniciar bot y vincular cuenta" },
    { command: "help", description: "Mostrar ayuda y comandos" },
    { command: "status", description: "Ver estado y ajustes" },
    { command: "list", description: "Listar fechas por filtro" },
    { command: "settings", description: "Ver ajustes actuales" },
    { command: "pause", description: "Pausar notificaciones" },
    { command: "resume", description: "Reanudar notificaciones" },
    { command: "mode", description: "Configurar modo de aviso" },
    { command: "tz", description: "Configurar zona horaria" },
    { command: "sync", description: "Sincronizar ahora" },
    { command: "test", description: "Enviar respuesta de prueba" },
  ];

  const groupCommands: BotCommand[] = [
    { command: "start", description: "Start bot" },
    { command: "help", description: "Show help" },
    { command: "status", description: "Show status" },
    { command: "list", description: "List deadlines" },
    { command: "sync", description: "Run sync now" },
  ];

  await setMyCommands(token, {
    commands: privateCommandsEn,
    scope: { type: "all_private_chats" },
  });
  await setMyCommands(token, {
    commands: privateCommandsHi,
    scope: { type: "all_private_chats" },
    language_code: "hi",
  });
  await setMyCommands(token, {
    commands: privateCommandsEs,
    scope: { type: "all_private_chats" },
    language_code: "es",
  });

  await setMyCommands(token, {
    commands: groupCommands,
    scope: { type: "all_group_chats" },
  });

  await callTelegram(token, "setChatMenuButton", {
    menu_button: { type: "commands" },
  });

  console.log("Telegram commands synced for private/group scopes with en/hi/es localization.");
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
