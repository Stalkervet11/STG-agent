export type IntentAction =
  | 'local_resource' | 'local_ai_only' | 'browser_open'
  | 'browser_search' | 'browser_screenshot' | 'browser_fetch'
  | 'teach_resource' | 'forget_resource' | 'list_resources'
  | 'search' | 'launch' | 'vpn_start' | 'vpn_restart'
  | 'create_folder' | 'create_file' | 'code_modify'
  | 'shell_exec' | 'write_file' | 'diagnostic' | 'ai_query' | 'unknown';

export interface ParsedIntent {
  action: IntentAction;
  target: string;
  raw: string;
  matchedResource?: string;
  shouldRunHandler?: boolean;
  params?: Record<string, string>;
}

export interface ParsedCommand {
  action:
    | 'search'
    | 'launch'
    | 'vpn_start'
    | 'vpn_restart'
    | 'create_folder'
    | 'create_file'
    | 'code_modify'
    | 'shell_exec'
    | 'write_file'
    | 'unknown';
  target: string;
  raw: string;
}

// ── Static local resource cache for fast checks ──

interface StaticResource { name: string; aliases: string[]; }

const LOCAL_RESOURCES_STATIC: StaticResource[] = [
  { name: 'вк', aliases: ['vk', 'vkontakte', 'музыка вк', 'вконтакте', 'vk.com'] },
  { name: 'почта', aliases: ['email', 'gmail', 'почта', 'письма', 'mail', 'почтовый ящик', 'электронная почта'] },
  { name: 'локальные файлы', aliases: ['мои файлы', 'документы', 'локальная папка', 'файлы на пк', 'файловая система', 'проводник'] },
  { name: 'telegram', aliases: ['телеграм', 'tg', 'телега', 'telegram'] },
  { name: 'календарь', aliases: ['calendar', 'расписание', 'встречи', 'календарь'] },
];

const LOCAL_CONTOUR_KEYWORDS = [
  'мой', 'моя', 'моё', 'мои', 'личный', 'личная', 'личное', 'личные',
  'локальный', 'локальная', 'локально', 'на моём', 'на моей', 'у меня',
  'мой аккаунт', 'моя страница', 'персональный', 'персональная',
];

export function parseIntent(text: string): ParsedIntent {
  const raw = text.trim();
  const lower = raw.toLowerCase();

  // 0. TEACH/FORGET/LIST
  if (/^(покажи|выведи|список|перечисли|какие|мои)\s+(мои\s+)?(локальные\s+)?(ресурсы|ресурсов)/i.test(lower)) {
    return { action: 'list_resources', target: '', raw };
  }
  const forgetMatch = lower.match(/^(?:забудь|удали|убери|сотри)\s+(?:ресурс|локальный\s+ресурс)\s+(.+)/i);
  if (forgetMatch) return { action: 'forget_resource', target: forgetMatch[1].trim(), raw };
  const teachMatch = lower.match(/^(?:запомни|добавь|запиши|зарегистрируй|сохрани)\s+(?:это|новый\s+)?(?:как\s+)?(?:локальный\s+)?(?:ресурс|личное|локальное)?\s*[:：]?\s*(.+)/i);
  if (teachMatch && teachMatch[1].trim().length > 3) return { action: 'teach_resource', target: teachMatch[1].trim(), raw };
  if (/это\s+(теперь\s+)?(локальный|личный|личное|мой\s+ресурс)/i.test(lower)) return { action: 'teach_resource', target: lower, raw };

  // 1. LOCAL CONTOUR
  for (const res of LOCAL_RESOURCES_STATIC) {
    if (lower.includes(res.name.toLowerCase()))
      return { action: 'local_resource', target: raw, raw, matchedResource: res.name, shouldRunHandler: true };
    for (const alias of res.aliases)
      if (lower.includes(alias.toLowerCase()))
        return { action: 'local_resource', target: raw, raw, matchedResource: res.name, shouldRunHandler: true };
  }
  for (const kw of LOCAL_CONTOUR_KEYWORDS)
    if (lower.includes(kw)) return { action: 'local_ai_only', target: raw, raw, shouldRunHandler: false };

  // 2. BROWSER
  const ssMatch = lower.match(/^(?:сделай|сними|захвати)\s+(?:скриншот|снимок|screenshot)\s+(?:сайта|страницы|экрана)?\s*(.+)?/i);
  if (ssMatch) {
    let url = (ssMatch[1] || '').trim();
    if (!url) return { action: 'browser_screenshot', target: 'https://google.com', raw };
    if (!url.startsWith('http')) url = 'https://' + url;
    return { action: 'browser_screenshot', target: url, raw };
  }
  const osMatch = lower.match(/^(?:открой|перейди\s+на|зайди\s+на|покажи)\s+(?:сайт|страницу|веб-сайт)?\s*(https?:\/\/\S+|[a-zA-Z0-9.-]+\.[a-z]{2,}\S*)/i);
  if (osMatch) {
    let url = osMatch[1].trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    return { action: 'browser_open', target: url, raw };
  }
  const wsMatch = lower.match(/^(?:найди|поищи|ищи|загугли|погугли)\s+(?:в\s+интернете|в\s+сети|в\s+гугле|мне)?\s*(.+)/i);
  if (wsMatch) return { action: 'browser_search', target: wsMatch[1].trim(), raw };
  const fetchMatch = lower.match(/^(?:извлеки|собери|прочитай|получи)\s+(?:данные|информацию|текст|контент)\s+(?:с\s+сайта|со\s+страницы)?\s*(.+)/i);
  if (fetchMatch) {
    let url = fetchMatch[1].trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    return { action: 'browser_fetch', target: url, raw };
  }

  // 3. SYSTEM COMMANDS
  const s = lower.match(/^(?:поиск|найди|ищи|погугли|загугли|google)\s+(.+)/i);
  if (s) return { action: 'search', target: s[1].trim(), raw };
  const vr = lower.match(/^(?:перезапусти|рестарт|ребутни)\s+(?:впн|vpn|службу\s+vpn)\s*(.*)/i);
  if (vr) return { action: 'vpn_restart', target: vr[1].trim() || 'openvpn', raw };
  const vs = lower.match(/^(?:включи|запусти|стартуй)\s+(?:впн|vpn|службу\s+vpn)\s*(.*)/i);
  if (vs) return { action: 'vpn_start', target: vs[1].trim() || 'openvpn', raw };
  const fm = lower.match(/^(?:создай|сделай|построй)\s+(?:папку|директорию|каталог)\s+(.+)/i);
  if (fm) return { action: 'create_folder', target: fm[1].trim(), raw };
  const flm = lower.match(/^(?:создай|сделай)\s+(?:файл|документ)\s+(.+)/i);
  if (flm) return { action: 'create_file', target: flm[1].trim(), raw };
  const ec = lower.match(/^(?:cd|mkdir|ls|echo|cat|touch|rm|cp|mv|git|npm|cargo|python|pip|dnf|systemctl|docker|curl|wget|tar|unzip|grep|find|ps|kill|df|du|whoami|pwd|env)\b.*/i);
  if (ec) return { action: 'shell_exec', target: ec[0].trim(), raw };
  const sm = lower.match(/^(?:выполни|запусти|exec|run|shell)\s+(?:команду\s+|в\s+терминале\s+)?(.+)/i);
  if (sm) return { action: 'shell_exec', target: sm[1].trim(), raw };
  const cm = lower.match(/^(?:перейди|cd|зайди)\s+(?:в\s+)?(?:папку|директорию|каталог)?\s*(.+)/i);
  if (cm) return { action: 'shell_exec', target: 'cd ' + cm[1].trim().replace(/^['"]|['"]$/g, '') + ' && pwd', raw };
  const wm = lower.match(/^(?:запиши|допиши|вставь)\s+(?:в\s+)?(?:файл\s+)?(.+?)\s+(?:содержимое|текст|контент|строку|данные)\s+(.+)/i);
  if (wm) return { action: 'write_file', target: wm[1].trim().replace(/^['"]|['"]$/g, '') + '|||' + wm[2].trim().replace(/^['"]|['"]$/g, ''), raw };
  const ws2 = lower.match(/^(?:запиши|допиши)\s+(?:в\s+)?(.+?)\s*[:：]\s*(.+)/i);
  if (ws2) return { action: 'write_file', target: ws2[1].trim().replace(/^['"]|['"]$/g, '') + '|||' + ws2[2].trim().replace(/^['"]|['"]$/g, ''), raw };
  const codem = lower.match(/^(?:напиши\s+(?:код|программу|скрипт|модуль|компонент)|измени\s+(?:файл|код|компонент)|добавь\s+(?:функцию|метод|класс|модуль)|реализуй|исправь\s+(?:баг|ошибку|проблему)|отрефактори|оптимизируй|почини|создай\s+(?:компонент|модуль|сервис|api|интерфейс))\s+(.+)/i);
  if (codem) return { action: 'code_modify', target: codem[1].trim(), raw };
  const lm = lower.match(/^(?:запусти|открой|стартуй|открой\s+программу)\s+(.+)/i);
  if (lm) return { action: 'launch', target: lm[1].trim(), raw };

  return { action: 'ai_query', target: raw, raw };
}

export function isLocalContourQuery(text: string): boolean {
  const lower = text.toLowerCase();
  for (const r of LOCAL_RESOURCES_STATIC) {
    if (lower.includes(r.name.toLowerCase())) return true;
    for (const a of r.aliases) if (lower.includes(a.toLowerCase())) return true;
  }
  for (const kw of LOCAL_CONTOUR_KEYWORDS) if (lower.includes(kw)) return true;
  return false;
}
