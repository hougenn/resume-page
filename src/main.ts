import { load as parseYaml } from 'js-yaml';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { marked } from 'marked';
import './styles.css';
import embeddedResumeYaml from '../resume.yml?raw';

type ModuleKey =
  | 'education'
  | 'skills'
  | 'projects'
  | 'profile'
  | 'work'
  | 'honors'
  | 'openSource';

interface SiteConfig {
  title: string;
  themeColor: string;
  pdfFileName: string;
  order: ModuleKey[];
  moduleTitles: Record<ModuleKey, string>;
}

interface BasicEducationSummary {
  school?: string;
  major?: string;
  degree?: string;
  graduationYear?: string;
  raw?: string;
}

interface ResumeLink {
  label: string;
  url: string;
}

interface Contacts {
  wechat?: string;
  phone?: string;
  email?: string;
}

interface WorkPeriod {
  start?: string;
  end?: string;
}

interface BasicConfig {
  name: string;
  gender?: string;
  age?: string;
  position?: string;
  workPeriod?: WorkPeriod;
  contacts: Contacts;
  educationSummary?: BasicEducationSummary;
  addressLinks: ResumeLink[];
}

interface EducationCourse {
  name: string;
  credit?: string;
}

interface EducationItem {
  school: string;
  start?: string;
  end?: string;
  gpa?: string;
  major?: string;
  courses?: EducationCourse[];
  rank?: string;
  degree?: string;
}

interface SkillsConfig {
  enabled: boolean;
  ordered: boolean;
  hideIndex: boolean;
  items: string[];
}

interface ProjectItem {
  name: string;
  time?: string;
  description?: string;
  responsibilities: string[];
  techStack: string[];
}

interface WorkItem {
  company: string;
  time?: string;
  position?: string;
  achievements: string[];
}

interface HonorItem {
  name: string;
  time?: string;
}

interface OpenSourceItem {
  name: string;
  url?: string;
  stars?: string;
  description?: string;
  achievements: string[];
}

interface NormalizedResumeConfig {
  site: SiteConfig;
  basic: BasicConfig;
  education?: {
    enabled: boolean;
    items: EducationItem[];
  };
  skills?: SkillsConfig;
  projects?: {
    enabled: boolean;
    items: ProjectItem[];
  };
  profile?: {
    enabled: boolean;
    content: string;
  };
  work?: {
    enabled: boolean;
    items: WorkItem[];
  };
  honors?: {
    enabled: boolean;
    items: HonorItem[];
  };
  openSource?: {
    enabled: boolean;
    items: OpenSourceItem[];
  };
}

interface RenderOptions {
  maskContacts: boolean;
  interactiveContacts: boolean;
}

const DEFAULT_ORDER: ModuleKey[] = [
  'education',
  'skills',
  'projects',
  'profile',
  'work',
  'honors',
  'openSource'
];

const MODULE_TITLES: Record<ModuleKey, string> = {
  education: '教育经历',
  skills: '专业技能',
  projects: '项目经历',
  profile: '自我描述',
  work: '工作经历',
  honors: '荣誉',
  openSource: '开源经历'
};

const MODULE_ALIAS: Record<string, ModuleKey> = {
  education: 'education',
  edu: 'education',
  skill: 'skills',
  skills: 'skills',
  project: 'projects',
  projects: 'projects',
  exp: 'projects',
  profile: 'profile',
  evaluation: 'profile',
  work: 'work',
  workexperience: 'work',
  honer: 'honors',
  honor: 'honors',
  honors: 'honors',
  opensource: 'openSource',
  open_source: 'openSource'
};

const appNode = document.querySelector<HTMLDivElement>('#app');

if (!appNode) {
  throw new Error('缺少根节点 #app');
}
const app: HTMLDivElement = appNode;
let toastTimer: number | undefined;
let toastLastMessage = '';
let toastVisibleUntil = 0;
let themeBaseColor = '#111111';
const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');
let themeListenerBound = false;

marked.setOptions({
  gfm: true,
  breaks: true
});

void bootstrap();

async function bootstrap(): Promise<void> {
  try {
    const rawConfig = await loadConfig();
    const config = normalizeConfig(rawConfig);
    applyTheme(config.site.themeColor);
    renderApp(config);
  } catch (error) {
    app.innerHTML = `<section class="error-card"><h1>配置加载失败</h1><p>${escapeHtml(
      String(error)
    )}</p></section>`;
  }
}

async function loadConfig(): Promise<unknown> {
  const query = new URLSearchParams(window.location.search);
  const fromQuery = query.get('config')?.trim();
  if (fromQuery) {
    const candidates = Array.from(
      new Set([
        fromQuery,
        `${import.meta.env.BASE_URL.replace(/\/+$/, '')}/${fromQuery.replace(/^\/+/, '')}`
      ])
    );

    for (const path of candidates) {
      const result = await fetch(path, { cache: 'no-store' });
      if (!result.ok) {
        continue;
      }
      const text = await result.text();
      if (!text.trim()) {
        continue;
      }
      return parseYaml(text);
    }

    throw new Error(`未找到指定配置文件: ${fromQuery}`);
  }

  if (!embeddedResumeYaml.trim()) {
    throw new Error('未找到可用配置文件，请提供 resume.yml');
  }
  return parseYaml(embeddedResumeYaml);
}

function normalizeConfig(raw: unknown): NormalizedResumeConfig {
  const data = (raw ?? {}) as Record<string, unknown>;

  if ('conf' in data && 'basic' in data) {
    return normalizeLegacyConfig(data);
  }

  return normalizeModernConfig(data);
}

function normalizeModernConfig(data: Record<string, unknown>): NormalizedResumeConfig {
  const siteObject = asRecord(data.site);
  const basicObject = asRecord(data.basic);
  const moduleTitles = {
    ...MODULE_TITLES,
    ...normalizeModuleTitleMap(asRecord(siteObject?.moduleTitles))
  };

  const site: SiteConfig = {
    title: toStringValue(siteObject?.title) ?? '个人简历',
    themeColor: normalizeColor(toStringValue(siteObject?.themeColor) ?? '#111111'),
    pdfFileName: toStringValue(siteObject?.pdfFileName) ?? 'resume.pdf',
    order: normalizeOrder(toStringArray(siteObject?.order)),
    moduleTitles
  };

  const basic: BasicConfig = {
    name: toStringValue(basicObject?.name) ?? '未命名',
    gender: toStringValue(basicObject?.gender),
    age: toStringValue(basicObject?.age),
    position: toStringValue(basicObject?.position),
    workPeriod: {
      start: toStringValue(asRecord(basicObject?.workPeriod)?.start),
      end: toStringValue(asRecord(basicObject?.workPeriod)?.end)
    },
    contacts: {
      wechat: toStringValue(asRecord(basicObject?.contacts)?.wechat),
      phone: toStringValue(asRecord(basicObject?.contacts)?.phone),
      email: toStringValue(asRecord(basicObject?.contacts)?.email)
    },
    educationSummary: normalizeEducationSummary(asRecord(basicObject?.educationSummary)),
    addressLinks: normalizeLinks(toArray(basicObject?.addressLinks))
  };

  return {
    site,
    basic,
    education: normalizeEducationSection(data.education),
    skills: normalizeSkillsSection(data.skills),
    projects: normalizeProjectsSection(data.projects),
    profile: normalizeProfileSection(data.profile),
    work: normalizeWorkSection(data.work),
    honors: normalizeHonorsSection(data.honors),
    openSource: normalizeOpenSourceSection(data.openSource)
  };
}

function normalizeLegacyConfig(data: Record<string, unknown>): NormalizedResumeConfig {
  const conf = asRecord(data.conf);
  const basicLegacy = asRecord(data.basic);
  const modulesFromConf = asRecord(conf?.modules);

  const overall = toStringValue(basicLegacy?.overall);
  const workPeriod = parseWorkPeriodText(overall);

  const site: SiteConfig = {
    title: toStringValue(conf?.title) ?? '个人简历',
    themeColor: normalizeColor(toStringValue(conf?.mainThemeColor) ?? '#111111'),
    pdfFileName: toStringValue(conf?.pdf) ?? 'resume.pdf',
    order: normalizeOrder(Object.keys(modulesFromConf ?? {})),
    moduleTitles: {
      ...MODULE_TITLES,
      ...normalizeModuleTitleMap(modulesFromConf)
    }
  };

  const basic: BasicConfig = {
    name: toStringValue(basicLegacy?.cnName) ?? '未命名',
    gender: toStringValue(basicLegacy?.sex),
    age: toStringValue(basicLegacy?.birth),
    position: toStringValue(basicLegacy?.objective),
    workPeriod,
    contacts: {
      wechat: toStringValue(basicLegacy?.wechat) ?? toStringValue(basicLegacy?.wechatText),
      phone: toStringValue(basicLegacy?.phone) ?? toStringValue(basicLegacy?.phoneNumber),
      email: toStringValue(basicLegacy?.email) ?? toStringValue(basicLegacy?.emailText)
    },
    educationSummary: basicLegacy?.college
      ? {
          raw: toStringValue(basicLegacy?.college)
        }
      : undefined,
    addressLinks: normalizeLegacyAddressLinks(basicLegacy)
  };

  const profileContent = toStringValue(data.evaluation);

  return {
    site,
    basic,
    education: undefined,
    skills: {
      enabled: true,
      ordered: false,
      hideIndex: false,
      items: toStringArray(data.skill)
    },
    projects: {
      enabled: true,
      items: normalizeLegacyProjects(toArray(data.exp))
    },
    profile: profileContent
      ? {
          enabled: true,
          content: profileContent
        }
      : undefined,
    work: {
      enabled: true,
      items: normalizeLegacyWorkItems(toArray(data.workExperience))
    },
    honors: normalizeHonorsSection(data.honors),
    openSource: normalizeOpenSourceSection(data.openSource)
  };
}

function normalizeEducationSection(input: unknown): NormalizedResumeConfig['education'] {
  if (!input) {
    return undefined;
  }

  const section = asRecord(input);
  const itemsRaw = toArray(section?.items ?? input);
  const items: EducationItem[] = [];

  for (const item of itemsRaw) {
    const source = asRecord(item);
    const school = toStringValue(source?.school);
    if (!school) {
      continue;
    }

    const coursesRaw = toArray(source?.courses);
    const courses: EducationCourse[] = [];
    for (const course of coursesRaw) {
      const courseObj = asRecord(course);
      const name = toStringValue(courseObj?.name) ?? toStringValue(course);
      if (!name) {
        continue;
      }
      courses.push({
        name,
        credit: toStringValue(courseObj?.credit)
      });
    }

    items.push({
      school,
      start: toStringValue(source?.start),
      end: toStringValue(source?.end),
      gpa: toStringValue(source?.gpa),
      major: toStringValue(source?.major),
      courses,
      rank: toStringValue(source?.rank),
      degree: toStringValue(source?.degree)
    });
  }

  if (!items.length) {
    return undefined;
  }

  return {
    enabled: toBooleanValue(section?.enabled, true),
    items
  };
}

function normalizeSkillsSection(input: unknown): NormalizedResumeConfig['skills'] {
  if (!input) {
    return undefined;
  }

  const section = asRecord(input);
  const items = toStringArray(section?.items ?? input);
  if (!items.length) {
    return undefined;
  }

  const listStyle = toStringValue(section?.listStyle)?.toLowerCase();

  return {
    enabled: toBooleanValue(section?.enabled, true),
    ordered: listStyle === 'ordered' || toBooleanValue(section?.ordered, false),
    hideIndex: toBooleanValue(section?.hideIndex, false),
    items
  };
}

function normalizeProjectsSection(input: unknown): NormalizedResumeConfig['projects'] {
  if (!input) {
    return undefined;
  }

  const section = asRecord(input);
  const itemsRaw = toArray(section?.items ?? input);
  const items: ProjectItem[] = [];

  for (const item of itemsRaw) {
    const source = asRecord(item);
    const name = toStringValue(source?.name);
    if (!name) {
      continue;
    }

    items.push({
      name,
      time: toStringValue(source?.time),
      description: toStringValue(source?.description),
      responsibilities: toStringArray(source?.responsibilities),
      techStack: normalizeTechStack(source?.techStack)
    });
  }

  if (!items.length) {
    return undefined;
  }

  return {
    enabled: toBooleanValue(section?.enabled, true),
    items
  };
}

function normalizeProfileSection(input: unknown): NormalizedResumeConfig['profile'] {
  if (!input) {
    return undefined;
  }

  const section = asRecord(input);
  const content = toStringValue(section?.content ?? input);
  if (!content) {
    return undefined;
  }

  return {
    enabled: toBooleanValue(section?.enabled, true),
    content
  };
}

function normalizeWorkSection(input: unknown): NormalizedResumeConfig['work'] {
  if (!input) {
    return undefined;
  }

  const section = asRecord(input);
  const itemsRaw = toArray(section?.items ?? input);
  const items: WorkItem[] = [];

  for (const item of itemsRaw) {
    const source = asRecord(item);
    const company = toStringValue(source?.company);
    if (!company) {
      continue;
    }

    items.push({
      company,
      time: toStringValue(source?.time),
      position: toStringValue(source?.position),
      achievements: toStringArray(source?.achievements)
    });
  }

  if (!items.length) {
    return undefined;
  }

  return {
    enabled: toBooleanValue(section?.enabled, true),
    items
  };
}

function normalizeHonorsSection(input: unknown): NormalizedResumeConfig['honors'] {
  if (!input) {
    return undefined;
  }

  const section = asRecord(input);
  const itemsRaw = toArray(section?.items ?? input);
  const items: HonorItem[] = [];

  for (const item of itemsRaw) {
    const source = asRecord(item);
    const name = toStringValue(source?.name) ?? toStringValue(item);
    if (!name) {
      continue;
    }
    items.push({
      name,
      time: toStringValue(source?.time)
    });
  }

  if (!items.length) {
    return undefined;
  }

  return {
    enabled: toBooleanValue(section?.enabled, true),
    items
  };
}

function normalizeOpenSourceSection(input: unknown): NormalizedResumeConfig['openSource'] {
  if (!input) {
    return undefined;
  }

  const section = asRecord(input);
  const itemsRaw = toArray(section?.items ?? input);
  const items: OpenSourceItem[] = [];

  for (const item of itemsRaw) {
    const source = asRecord(item);
    const name = toStringValue(source?.name);
    if (!name) {
      continue;
    }

    items.push({
      name,
      url: toStringValue(source?.url),
      stars: toStringValue(source?.stars),
      description: toStringValue(source?.description),
      achievements: toStringArray(source?.achievements)
    });
  }

  if (!items.length) {
    return undefined;
  }

  return {
    enabled: toBooleanValue(section?.enabled, true),
    items
  };
}

function normalizeLegacyProjects(items: unknown[]): ProjectItem[] {
  const output: ProjectItem[] = [];
  for (const item of items) {
    const source = asRecord(item);
    const name = toStringValue(source?.name);
    if (!name) {
      continue;
    }
    output.push({
      name,
      time: toStringValue(source?.role)?.replace('后端开发 • ', ''),
      description: toStringValue(source?.bg),
      responsibilities: toStringArray(source?.des),
      techStack: normalizeTechStack(source?.stack)
    });
  }
  return output;
}

function normalizeLegacyWorkItems(items: unknown[]): WorkItem[] {
  const output: WorkItem[] = [];
  for (const item of items) {
    const source = asRecord(item);
    const company = toStringValue(source?.company);
    if (!company) {
      continue;
    }
    output.push({
      company,
      time: joinTimeRange(toStringValue(source?.startDate), toStringValue(source?.endDate)),
      position: toStringValue(source?.position),
      achievements: toStringArray(source?.responsibilities)
    });
  }
  return output;
}

function normalizeLinks(items: unknown[]): ResumeLink[] {
  return items
    .map((item) => {
      const source = asRecord(item);
      const label = toStringValue(source?.label);
      const url = toStringValue(source?.url);
      if (!label || !url) {
        return undefined;
      }
      return { label, url };
    })
    .filter((item): item is ResumeLink => Boolean(item));
}

function normalizeLegacyAddressLinks(basic: Record<string, unknown> | undefined): ResumeLink[] {
  const city = toStringValue(basic?.city);
  if (!city) {
    return [];
  }
  return [{ label: city, url: `https://maps.google.com/?q=${encodeURIComponent(city)}` }];
}

function normalizeEducationSummary(input?: Record<string, unknown>): BasicEducationSummary | undefined {
  if (!input) {
    return undefined;
  }
  return {
    school: toStringValue(input.school),
    major: toStringValue(input.major),
    degree: toStringValue(input.degree),
    graduationYear: toStringValue(input.graduationYear),
    raw: toStringValue(input.raw)
  };
}

function normalizeOrder(order: string[]): ModuleKey[] {
  const output: ModuleKey[] = [];
  const source = order.length ? order : DEFAULT_ORDER;

  for (const rawKey of source) {
    const normalized = normalizeModuleKey(rawKey);
    if (!normalized || output.includes(normalized)) {
      continue;
    }
    output.push(normalized);
  }

  for (const fallbackKey of DEFAULT_ORDER) {
    if (!output.includes(fallbackKey)) {
      output.push(fallbackKey);
    }
  }

  return output;
}

function normalizeModuleKey(value: string | undefined): ModuleKey | undefined {
  if (!value) {
    return undefined;
  }
  const clean = value.replace(/[_\s-]/g, '').toLowerCase();
  return MODULE_ALIAS[clean];
}

function normalizeModuleTitleMap(input?: Record<string, unknown>): Partial<Record<ModuleKey, string>> {
  if (!input) {
    return {};
  }

  const output: Partial<Record<ModuleKey, string>> = {};
  for (const [key, title] of Object.entries(input)) {
    const moduleKey = normalizeModuleKey(key);
    const text = toStringValue(title);
    if (moduleKey && text) {
      output[moduleKey] = text;
    }
  }
  return output;
}

function normalizeColor(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '#111111';
  }
  if (trimmed.startsWith('#')) {
    return trimmed;
  }
  return `#${trimmed}`;
}

function normalizeTechStack(input: unknown): string[] {
  const fromArray = toStringArray(input);
  if (fromArray.length) {
    return fromArray;
  }
  const value = toStringValue(input);
  if (!value) {
    return [];
  }
  return value
    .split(/[\s,/|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseWorkPeriodText(value?: string): WorkPeriod | undefined {
  if (!value) {
    return undefined;
  }
  const [start, end] = value.split(/[~～—–-]/).map((item) => item.trim());
  if (!start && !end) {
    return undefined;
  }
  return {
    start,
    end
  };
}

function renderApp(config: NormalizedResumeConfig): void {
  app.innerHTML = `
    <div class="app-shell">
      <div class="toolbar" aria-label="工具栏">
        <button class="tool-btn" id="toggleMarkdown" type="button" aria-label="查看 markdown 内容" title="查看 markdown 内容">
          <span class="tool-label tool-label-md">MD</span>
        </button>
        <button class="tool-btn tool-btn-primary" id="downloadPdf" type="button" aria-label="导出 PDF" title="导出 PDF">
          <span class="tool-label tool-label-pdf">PDF</span>
        </button>
      </div>

      <article class="resume-paper" id="resumePaper">
        ${renderResumeContent(config, { maskContacts: true, interactiveContacts: true })}
      </article>

      <div class="markdown-overlay" id="markdownOverlay" aria-hidden="true">
        <aside class="markdown-drawer" id="markdownDrawer" aria-hidden="true">
          <pre id="markdownContent" class="markdown-content"></pre>
        </aside>
        <button id="markdownBack" class="markdown-mobile-back" type="button" aria-label="返回简历" title="返回简历">
          <img src="/icons/arrow-left-black.svg" alt="" aria-hidden="true" />
        </button>
      </div>

      <div id="toast" class="toast" role="status" aria-live="polite"></div>
    </div>
  `;

  bindActions(config);

  const resumePaper = document.querySelector<HTMLElement>('#resumePaper');
  if (resumePaper) {
    enhanceLinks(resumePaper);
  }
}

function renderResumeContent(config: NormalizedResumeConfig, options: RenderOptions): string {
  const headerHtml = renderHeader(config.basic, options);
  const fallbackEducation = renderBasicEducationSection(config);
  const sectionHtml = config.site.order
    .map((moduleKey) => renderModule(config, moduleKey))
    .filter(Boolean)
    .join('');

  return `${headerHtml}${fallbackEducation}${sectionHtml}`;
}

function renderHeader(basic: BasicConfig, options: RenderOptions): string {
  const contactLine = renderHeaderContactLine(basic, options);
  return `
    <header class="resume-header resume-header-center">
      <h1>${escapeHtml(basic.name)}</h1>
      ${basic.position ? `<p class="header-role">${escapeHtml(basic.position)}</p>` : ''}
      ${contactLine ? `<p class="header-contact-row">${contactLine}</p>` : ''}
    </header>
  `;
}

function renderHeaderContactLine(basic: BasicConfig, options: RenderOptions): string {
  const contacts = basic.contacts;
  const items: string[] = [];

  const phoneText = contacts.phone
    ? options.maskContacts
      ? maskPhone(contacts.phone)
      : contacts.phone
    : '';
  const wechatText = contacts.wechat
    ? options.maskContacts
      ? maskWeChat(contacts.wechat)
      : contacts.wechat
    : '';
  const emailText = contacts.email
    ? options.maskContacts
      ? maskEmail(contacts.email)
      : contacts.email
    : '';

  if (contacts.email && emailText) {
    if (options.interactiveContacts) {
      items.push(
        `<span class="header-contact-item contact-action" role="link" tabindex="0" data-contact-action="email" data-contact-value="${escapeHtml(contacts.email)}"><i class="resume-icon header-contact-icon icon-qunfengyouxiang" aria-hidden="true"></i><span>${escapeHtml(emailText)}</span></span>`
      );
    } else {
      items.push(
        `<span class="header-contact-item"><i class="resume-icon header-contact-icon icon-qunfengyouxiang" aria-hidden="true"></i><span>${escapeHtml(emailText)}</span></span>`
      );
    }
  }

  if (contacts.phone && phoneText) {
    if (options.interactiveContacts) {
      items.push(
        `<span class="header-contact-item contact-action" role="link" tabindex="0" data-contact-action="phone" data-contact-value="${escapeHtml(contacts.phone)}"><i class="resume-icon header-contact-icon icon-shoujihaoma" aria-hidden="true"></i><span>${escapeHtml(phoneText)}</span></span>`
      );
    } else {
      items.push(
        `<span class="header-contact-item"><i class="resume-icon header-contact-icon icon-shoujihaoma" aria-hidden="true"></i><span>${escapeHtml(phoneText)}</span></span>`
      );
    }
  }

  if (contacts.wechat && wechatText) {
    if (options.interactiveContacts) {
      items.push(
        `<span class="header-contact-item contact-action" role="button" tabindex="0" data-contact-action="wechat" data-contact-value="${escapeHtml(contacts.wechat)}"><i class="resume-icon header-contact-icon icon-weixin1" aria-hidden="true"></i><span>${escapeHtml(wechatText)}</span></span>`
      );
    } else {
      items.push(
        `<span class="header-contact-item"><i class="resume-icon header-contact-icon icon-weixin1" aria-hidden="true"></i><span>${escapeHtml(wechatText)}</span></span>`
      );
    }
  }

  if (basic.addressLinks.length) {
    for (const link of basic.addressLinks) {
      items.push(
        `<a class="header-contact-item" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer"><i class="resume-icon header-contact-icon icon-wangzhi_huaban" aria-hidden="true"></i><span>${escapeHtml(link.label)}</span></a>`
      );
    }
  }

  return items.join('');
}

function renderBasicEducationSection(config: NormalizedResumeConfig): string {
  const hasEducationModule = Boolean(config.education?.enabled && config.education.items.length > 0);
  const summary = config.basic.educationSummary;
  if (hasEducationModule || !summary) {
    return '';
  }

  const text = summary.raw
    ? escapeHtml(summary.raw)
    : [summary.school, summary.major, summary.degree, summary.graduationYear]
        .filter(Boolean)
        .map((item) => escapeHtml(item ?? ''))
        .join(' · ');

  if (!text) {
    return '';
  }

  return renderSection(config.site.moduleTitles.education, `<article class="entry"><h3>${text}</h3></article>`);
}

function renderEducationSummary(summary?: BasicEducationSummary): string {
  if (!summary) {
    return '';
  }
  if (summary.raw) {
    return escapeHtml(summary.raw);
  }

  const parts = [summary.school, summary.major, summary.degree, summary.graduationYear]
    .filter(Boolean)
    .map((item) => escapeHtml(item ?? ''));
  return parts.join(' · ');
}

function renderModule(config: NormalizedResumeConfig, key: ModuleKey): string {
  switch (key) {
    case 'education':
      return renderEducationModule(config.site.moduleTitles.education, config.education);
    case 'skills':
      return renderSkillsModule(config.site.moduleTitles.skills, config.skills);
    case 'projects':
      return renderProjectModule(config.site.moduleTitles.projects, config.projects);
    case 'profile':
      return renderProfileModule(config.site.moduleTitles.profile, config.profile);
    case 'work':
      return renderWorkModule(config.site.moduleTitles.work, config.work);
    case 'honors':
      return renderHonorModule(config.site.moduleTitles.honors, config.honors);
    case 'openSource':
      return renderOpenSourceModule(config.site.moduleTitles.openSource, config.openSource);
    default:
      return '';
  }
}

function renderSection(title: string, content: string): string {
  if (!content.trim()) {
    return '';
  }
  return `
    <section class="resume-section">
      <h2>${escapeHtml(title)}</h2>
      <div class="section-body">${content}</div>
    </section>
  `;
}

function renderEducationModule(
  title: string,
  section: NormalizedResumeConfig['education']
): string {
  if (!section?.enabled || !section.items.length) {
    return '';
  }

  const content = section.items
    .map((item) => {
      const period = item.start || item.end ? `${escapeHtml(item.start ?? '')} - ${escapeHtml(item.end ?? '')}` : '';
      const meta = [
        item.degree ? `学历：${escapeHtml(item.degree)}` : '',
        item.major ? `专业：${escapeHtml(item.major)}` : '',
        item.gpa ? `GPA：${escapeHtml(item.gpa)}` : '',
        item.rank ? `排名：${escapeHtml(item.rank)}` : ''
      ]
        .filter(Boolean)
        .join(' / ');

      const courses = (item.courses ?? [])
        .map((course) =>
          course.credit
            ? `<li>${toInlineMarkdown(course.name)} <span class="light">(${escapeHtml(course.credit)} 学分)</span></li>`
            : `<li>${toInlineMarkdown(course.name)}</li>`
        )
        .join('');

      return `
        <article class="entry">
          <div class="entry-head">
            <h3 class="edu-school">${toInlineMarkdown(item.school)}</h3>
            ${period ? `<time>${period}</time>` : ''}
          </div>
          ${meta ? `<p class="entry-meta">${meta}</p>` : ''}
          ${courses ? `<ul class="compact-list">${courses}</ul>` : ''}
        </article>
      `;
    })
    .join('');

  return renderSection(title, content);
}

function renderSkillsModule(title: string, section: NormalizedResumeConfig['skills']): string {
  if (!section?.enabled || !section.items.length) {
    return '';
  }

  const listTag = section.ordered ? 'ol' : 'ul';
  const noIndexClass = section.ordered && section.hideIndex ? ' no-index' : '';
  const items = section.items.map((item) => `<li>${toInlineMarkdown(item)}</li>`).join('');

  return renderSection(title, `<${listTag} class="skill-list${noIndexClass}">${items}</${listTag}>`);
}

function renderProjectModule(title: string, section: NormalizedResumeConfig['projects']): string {
  if (!section?.enabled || !section.items.length) {
    return '';
  }

  const content = section.items
    .map((item) => {
      const responsibilities = item.responsibilities
        .map((entry) => `<li>${toInlineMarkdown(entry)}</li>`)
        .join('');
      const stack = item.techStack.map((tech) => `<span>${escapeHtml(tech)}</span>`).join('');

      return `
        <article class="entry">
          <div class="entry-head">
            <h3>${toInlineMarkdown(item.name)}</h3>
            ${item.time ? `<time>${escapeHtml(item.time)}</time>` : ''}
          </div>
          ${item.description ? `<div class="markdown project-description">${toBlockMarkdown(item.description)}</div>` : ''}
          ${responsibilities ? `<ol class="compact-list">${responsibilities}</ol>` : ''}
          ${stack ? `<p class="tag-row">${stack}</p>` : ''}
        </article>
      `;
    })
    .join('');

  return renderSection(title, content);
}

function renderProfileModule(title: string, section: NormalizedResumeConfig['profile']): string {
  if (!section?.enabled || !section.content) {
    return '';
  }

  return renderSection(title, `<div class="markdown">${toBlockMarkdown(section.content)}</div>`);
}

function renderWorkModule(title: string, section: NormalizedResumeConfig['work']): string {
  if (!section?.enabled || !section.items.length) {
    return '';
  }

  const content = section.items
    .map((item) => {
      const achievements = item.achievements
        .map((entry) => `<li>${toInlineMarkdown(entry)}</li>`)
        .join('');

      return `
        <article class="entry">
          <div class="entry-head">
            <h3>${toInlineMarkdown(item.company)}</h3>
            ${item.time ? `<time>${escapeHtml(item.time)}</time>` : ''}
          </div>
          ${item.position ? `<p class="entry-meta">${escapeHtml(item.position)}</p>` : ''}
          ${achievements ? `<ol class="compact-list">${achievements}</ol>` : ''}
        </article>
      `;
    })
    .join('');

  return renderSection(title, content);
}

function renderHonorModule(title: string, section: NormalizedResumeConfig['honors']): string {
  if (!section?.enabled || !section.items.length) {
    return '';
  }

  const items = section.items
    .map((item) =>
      item.time
        ? `<li>${toInlineMarkdown(item.name)} <span class="light">(${escapeHtml(item.time)})</span></li>`
        : `<li>${toInlineMarkdown(item.name)}</li>`
    )
    .join('');

  return renderSection(title, `<ul class="compact-list">${items}</ul>`);
}

function renderOpenSourceModule(
  title: string,
  section: NormalizedResumeConfig['openSource']
): string {
  if (!section?.enabled || !section.items.length) {
    return '';
  }

  const content = section.items
    .map((item) => {
      const achievements = item.achievements
        .map((entry) => `<li>${toInlineMarkdown(entry)}</li>`)
        .join('');
      const titleLink = item.url
        ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${toInlineMarkdown(item.name)}</a>`
        : toInlineMarkdown(item.name);

      return `
        <article class="entry">
          <div class="entry-head">
            <h3>${titleLink}</h3>
            ${
              item.stars
                ? `<time class="star-metric"><span>${escapeHtml(item.stars)}</span><i class="resume-icon icon-star" aria-hidden="true"></i></time>`
                : ''
            }
          </div>
          ${item.description ? `<div class="markdown">${toBlockMarkdown(item.description)}</div>` : ''}
          ${achievements ? `<ol class="compact-list">${achievements}</ol>` : ''}
        </article>
      `;
    })
    .join('');

  return renderSection(title, content);
}

function bindActions(config: NormalizedResumeConfig): void {
  const toggleButton = document.querySelector<HTMLButtonElement>('#toggleMarkdown');
  const backButton = document.querySelector<HTMLButtonElement>('#markdownBack');
  const overlay = document.querySelector<HTMLElement>('#markdownOverlay');
  const drawer = document.querySelector<HTMLElement>('#markdownDrawer');
  const markdownContent = document.querySelector<HTMLElement>('#markdownContent');
  const downloadButton = document.querySelector<HTMLButtonElement>('#downloadPdf');
  const closeMarkdown = (): void => {
    if (!overlay || !drawer) {
      return;
    }
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('markdown-open');
  };

  toggleButton?.addEventListener('click', () => {
    if (!overlay || !drawer || !markdownContent) {
      return;
    }
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('markdown-open');
    markdownContent.textContent = generateMarkdown(config);
  });

  backButton?.addEventListener('click', closeMarkdown);
  overlay?.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeMarkdown();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMarkdown();
    }
  });

  downloadButton?.addEventListener('click', async () => {
    try {
      showToast('正在生成 PDF...');
      await exportResumePdf(config);
      showToast('PDF 导出完成');
    } catch (error) {
      showToast('PDF 导出失败，请重试');
      // eslint-disable-next-line no-console
      console.error(error);
    }
  });

  document.querySelectorAll<HTMLElement>('[data-contact-action]').forEach((element) => {
    const runAction = async (): Promise<void> => {
      const action = element.getAttribute('data-contact-action') ?? '';
      const value = element.getAttribute('data-contact-value') ?? '';
      if (!action || !value) {
        return;
      }

      if (action === 'wechat') {
        try {
          await navigator.clipboard.writeText(value);
          showToast('微信号已复制');
        } catch {
          showToast('复制失败，请手动复制');
        }
        return;
      }

      if (action === 'phone') {
        window.location.href = `tel:${value}`;
        return;
      }

      if (action === 'email') {
        window.location.href = `mailto:${value}`;
      }
    };

    element.addEventListener('click', () => {
      void runAction();
    });

    element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        void runAction();
      }
    });
  });
}

async function exportResumePdf(config: NormalizedResumeConfig): Promise<void> {
  const host = document.createElement('div');
  host.className = 'pdf-export-host export-light';
  host.innerHTML = `
    <article class="resume-paper export-paper" id="exportPaper">
      ${renderResumeContent(config, { maskContacts: false, interactiveContacts: false })}
    </article>
  `;
  document.body.appendChild(host);

  const exportPaper = host.querySelector<HTMLElement>('#exportPaper');
  if (!exportPaper) {
    host.remove();
    throw new Error('导出节点不存在');
  }

  try {
    await document.fonts.ready;
    await waitNextFrame();

    const canvas = await html2canvas(exportPaper, {
      scale: Math.max(2, window.devicePixelRatio || 1),
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: exportPaper.scrollWidth,
      windowHeight: exportPaper.scrollHeight
    });

    const marginMm = 8;
    const paperWidthMm = 210;
    const paperHeightMm = 297;
    const contentWidthMm = paperWidthMm - marginMm * 2;
    const contentHeightMm = paperHeightMm - marginMm * 2;
    const pxPerMm = canvas.width / contentWidthMm;
    const pageHeightPx = Math.floor(contentHeightMm * pxPerMm);
    const scale = canvas.height / exportPaper.scrollHeight;
    const cuts = getPagedCuts(exportPaper, canvas.height, pageHeightPx, scale);

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    for (let index = 0; index < cuts.length; index += 1) {
      const [sliceStart, sliceEnd] = cuts[index];
      const sliceHeight = sliceEnd - sliceStart;
      if (sliceHeight <= 0) {
        continue;
      }

      if (index > 0) {
        pdf.addPage('a4', 'portrait');
      }

      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;
      const pageCtx = pageCanvas.getContext('2d');
      if (!pageCtx) {
        throw new Error('无法创建导出画布');
      }

      pageCtx.drawImage(
        canvas,
        0,
        sliceStart,
        canvas.width,
        sliceHeight,
        0,
        0,
        canvas.width,
        sliceHeight
      );

      const imageData = pageCanvas.toDataURL('image/jpeg', 0.96);
      const heightMm = sliceHeight / pxPerMm;
      pdf.addImage(imageData, 'JPEG', marginMm, marginMm, contentWidthMm, heightMm, undefined, 'FAST');
    }

    pdf.save(ensurePdfFileName(config.site.pdfFileName));
  } finally {
    host.remove();
  }
}

function getPagedCuts(
  paper: HTMLElement,
  totalHeightPx: number,
  pageHeightPx: number,
  scale: number
): Array<[number, number]> {
  const safeCuts = collectSafeCuts(paper, scale, totalHeightPx);
  const segments: Array<[number, number]> = [];
  const minimumSegmentPx = Math.floor(pageHeightPx * 0.55);
  let cursor = 0;

  while (cursor < totalHeightPx) {
    const target = cursor + pageHeightPx;
    if (target >= totalHeightPx) {
      segments.push([cursor, totalHeightPx]);
      break;
    }

    const candidate = findLastSafeCut(safeCuts, cursor + minimumSegmentPx, target);
    let next = candidate ?? target;
    if (next <= cursor + 80) {
      next = Math.min(totalHeightPx, target);
    }
    segments.push([cursor, next]);
    cursor = next;
  }

  return segments;
}

function collectSafeCuts(paper: HTMLElement, scale: number, totalHeightPx: number): number[] {
  const values = new Set<number>([0, totalHeightPx]);
  const candidates = paper.querySelectorAll<HTMLElement>('.resume-section, .entry');

  candidates.forEach((node) => {
    const top = Math.floor(node.offsetTop * scale);
    const bottom = Math.floor((node.offsetTop + node.offsetHeight) * scale);
    if (top > 0 && top < totalHeightPx) {
      values.add(top);
    }
    if (bottom > 0 && bottom < totalHeightPx) {
      values.add(bottom);
    }
  });

  return Array.from(values).sort((a, b) => a - b);
}

function findLastSafeCut(cuts: number[], min: number, max: number): number | undefined {
  let output: number | undefined;
  for (const cut of cuts) {
    if (cut < min) {
      continue;
    }
    if (cut > max) {
      break;
    }
    output = cut;
  }
  return output;
}

function ensurePdfFileName(value: string): string {
  return /\.pdf$/i.test(value) ? value : `${value}.pdf`;
}

function waitNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function enhanceLinks(container: HTMLElement): void {
  container.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
    const href = anchor.getAttribute('href') ?? '';
    if (/^https?:\/\//.test(href)) {
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
    }
  });
}

function generateMarkdown(config: NormalizedResumeConfig): string {
  const lines: string[] = [];
  const basic = config.basic;

  lines.push(`# ${basic.name}`);
  if (basic.position) {
    lines.push('', `> ${basic.position}`);
  }

  lines.push('');
  lines.push('## 基本信息');

  const baseInfo: string[] = [];
  if (basic.gender) {
    baseInfo.push(`- 性别：${basic.gender}`);
  }
  if (basic.age) {
    baseInfo.push(`- 年龄：${basic.age}`);
  }
  const experience = getExperienceText(basic.workPeriod?.start, basic.workPeriod?.end);
  if (experience) {
    baseInfo.push(`- 工作年限：${experience}`);
  }
  if (basic.contacts.phone) {
    baseInfo.push(`- 电话：${maskPhone(basic.contacts.phone)} ([拨打](tel:${basic.contacts.phone}))`);
  }
  if (basic.contacts.wechat) {
    baseInfo.push(`- 微信：${maskWeChat(basic.contacts.wechat)}`);
  }
  if (basic.contacts.email) {
    baseInfo.push(
      `- 邮箱：${maskEmail(basic.contacts.email)} ([发送邮件](mailto:${basic.contacts.email}))`
    );
  }
  if (basic.addressLinks.length) {
    const linkText = basic.addressLinks
      .map((link) => `[${link.label}](${link.url})`)
      .join(' / ');
    baseInfo.push(`- 地址/链接：${linkText}`);
  }

  if (
    basic.educationSummary &&
    !(config.education?.enabled && config.education.items.length > 0)
  ) {
    const edu = renderEducationSummary(basic.educationSummary);
    if (edu) {
      baseInfo.push(`- 教育：${edu}`);
    }
  }

  lines.push(...baseInfo);

  for (const moduleKey of config.site.order) {
    if (moduleKey === 'education' && config.education?.enabled && config.education.items.length) {
      lines.push('', `## ${config.site.moduleTitles.education}`);
      for (const item of config.education.items) {
        lines.push(
          `- **${item.school}** ${item.start || item.end ? `(${item.start ?? ''} - ${item.end ?? ''})` : ''}`
        );
        const detailLine = [
          item.degree ? `学历：${item.degree}` : '',
          item.major ? `专业：${item.major}` : '',
          item.gpa ? `GPA：${item.gpa}` : '',
          item.rank ? `排名：${item.rank}` : ''
        ]
          .filter(Boolean)
          .join('，');
        if (detailLine) {
          lines.push(`  - ${detailLine}`);
        }
        if (item.courses?.length) {
          for (const course of item.courses) {
            lines.push(`  - 课程：${course.name}${course.credit ? `（${course.credit} 学分）` : ''}`);
          }
        }
      }
    }

    if (moduleKey === 'skills' && config.skills?.enabled && config.skills.items.length) {
      lines.push('', `## ${config.site.moduleTitles.skills}`);
      config.skills.items.forEach((item, index) => {
        if (config.skills?.ordered && !config.skills.hideIndex) {
          lines.push(`${index + 1}. ${item}`);
        } else {
          lines.push(`- ${item}`);
        }
      });
    }

    if (moduleKey === 'projects' && config.projects?.enabled && config.projects.items.length) {
      lines.push('', `## ${config.site.moduleTitles.projects}`);
      for (const item of config.projects.items) {
        lines.push(`- **${item.name}**${item.time ? ` (${item.time})` : ''}`);
        if (item.description) {
          lines.push(`  - 项目描述：${item.description}`);
        }
        item.responsibilities.forEach((entry) => lines.push(`  - ${entry}`));
        if (item.techStack.length) {
          lines.push(`  - 技术栈：${item.techStack.join(' / ')}`);
        }
      }
    }

    if (moduleKey === 'profile' && config.profile?.enabled && config.profile.content) {
      lines.push('', `## ${config.site.moduleTitles.profile}`, '', config.profile.content);
    }

    if (moduleKey === 'work' && config.work?.enabled && config.work.items.length) {
      lines.push('', `## ${config.site.moduleTitles.work}`);
      for (const item of config.work.items) {
        lines.push(`- **${item.company}**${item.time ? ` (${item.time})` : ''}`);
        if (item.position) {
          lines.push(`  - 岗位：${item.position}`);
        }
        item.achievements.forEach((entry) => lines.push(`  - ${entry}`));
      }
    }

    if (moduleKey === 'honors' && config.honors?.enabled && config.honors.items.length) {
      lines.push('', `## ${config.site.moduleTitles.honors}`);
      config.honors.items.forEach((item) => {
        lines.push(`- ${item.name}${item.time ? ` (${item.time})` : ''}`);
      });
    }

    if (
      moduleKey === 'openSource' &&
      config.openSource?.enabled &&
      config.openSource.items.length
    ) {
      lines.push('', `## ${config.site.moduleTitles.openSource}`);
      for (const item of config.openSource.items) {
        const title = item.url ? `[${item.name}](${item.url})` : item.name;
        lines.push(`- ${title}${item.stars ? ` (⭐ ${item.stars})` : ''}`);
        if (item.description) {
          lines.push(`  - 项目描述：${item.description}`);
        }
        item.achievements.forEach((entry) => lines.push(`  - ${entry}`));
      }
    }
  }

  return lines.join('\n');
}

function getExperienceText(start?: string, end?: string): string {
  if (!start) {
    return [start, end].filter(Boolean).join(' - ');
  }

  const dateStart = parseYearMonth(start);
  const dateEnd = parseYearMonth(end);
  if (!dateStart) {
    return [start, end].filter(Boolean).join(' - ');
  }

  const effectiveEnd = dateEnd ?? new Date();
  let monthDiff =
    (effectiveEnd.getFullYear() - dateStart.getFullYear()) * 12 +
    (effectiveEnd.getMonth() - dateStart.getMonth());

  if (monthDiff < 0) {
    monthDiff = 0;
  }

  const years = Math.floor(monthDiff / 12);
  const months = monthDiff % 12;
  const duration = [
    years > 0 ? `${years}年` : '',
    months > 0 ? `${months}个月` : years === 0 ? '不足1年' : ''
  ]
    .filter(Boolean)
    .join('');

  return `${start}${end ? ` - ${end}` : ''}${duration ? `（${duration}）` : ''}`;
}

function parseYearMonth(input?: string): Date | undefined {
  if (!input) {
    return undefined;
  }
  if (input.includes('至今') || input.includes('现在')) {
    return new Date();
  }

  const match = input.match(/(\d{4})\D?(\d{1,2})?/);
  if (!match) {
    return undefined;
  }

  const year = Number(match[1]);
  const month = Number(match[2] ?? 1);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return undefined;
  }

  return new Date(year, Math.max(0, month - 1), 1);
}

function toInlineMarkdown(value: string): string {
  return marked.parseInline(value) as string;
}

function toBlockMarkdown(value: string): string {
  return marked.parse(value) as string;
}

function showToast(message: string): void {
  const toast = document.querySelector<HTMLElement>('#toast');
  if (!toast) {
    return;
  }

  const now = Date.now();
  const toastIsVisible = now < toastVisibleUntil;

  // Ignore repeated messages while current toast is still visible.
  if (toastIsVisible && toastLastMessage === message) {
    return;
  }

  if (toastTimer) {
    window.clearTimeout(toastTimer);
  }

  toast.textContent = message;
  toast.classList.add('show');
  toastLastMessage = message;
  toastVisibleUntil = now + 900;

  toastTimer = window.setTimeout(() => {
    toast.classList.remove('show');
    toastVisibleUntil = 0;
    toastTimer = undefined;
  }, 900);
}

function maskPhone(phone: string): string {
  const cleaned = phone.replace(/\s+/g, '');
  if (cleaned.length < 7) {
    return cleaned;
  }
  return `${cleaned.slice(0, 3)}****${cleaned.slice(-4)}`;
}

function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!name || !domain) {
    return email;
  }
  if (name.length < 3) {
    return `${name[0] ?? '*'}***@${domain}`;
  }
  return `${name.slice(0, 1)}***${name.slice(-1)}@${domain}`;
}

function maskWeChat(wechat: string): string {
  if (wechat.length <= 4) {
    return `${wechat[0] ?? '*'}***`;
  }
  return `${wechat.slice(0, 2)}***${wechat.slice(-2)}`;
}

function applyTheme(color: string): void {
  themeBaseColor = normalizeColor(color);
  document.documentElement.style.setProperty('--theme-color-base', themeBaseColor);
  applyAdaptiveTheme();

  if (!themeListenerBound) {
    const mediaQueryCompat = systemDarkQuery as MediaQueryList & {
      addListener?: (listener: (this: MediaQueryList, ev: MediaQueryListEvent) => void) => void;
    };
    if (typeof mediaQueryCompat.addEventListener === 'function') {
      mediaQueryCompat.addEventListener('change', applyAdaptiveTheme);
    } else if (typeof mediaQueryCompat.addListener === 'function') {
      mediaQueryCompat.addListener(applyAdaptiveTheme);
    }
    themeListenerBound = true;
  }
}

function applyAdaptiveTheme(): void {
  const adaptive = systemDarkQuery.matches
    ? mixHexColors(themeBaseColor, '#ffffff', 0.55)
    : themeBaseColor;
  document.documentElement.style.setProperty('--theme-color', adaptive);
}

function mixHexColors(source: string, target: string, ratio: number): string {
  const a = hexToRgb(source);
  const b = hexToRgb(target);
  const clampRatio = Math.min(1, Math.max(0, ratio));
  const r = Math.round(a.r * (1 - clampRatio) + b.r * clampRatio);
  const g = Math.round(a.g * (1 - clampRatio) + b.g * clampRatio);
  const bValue = Math.round(a.b * (1 - clampRatio) + b.b * clampRatio);
  return `#${toHex(r)}${toHex(g)}${toHex(bValue)}`;
}

function hexToRgb(input: string): { r: number; g: number; b: number } {
  const normalized = normalizeColor(input).replace('#', '');
  if (normalized.length === 3) {
    return {
      r: Number.parseInt(normalized[0] + normalized[0], 16),
      g: Number.parseInt(normalized[1] + normalized[1], 16),
      b: Number.parseInt(normalized[2] + normalized[2], 16)
    };
  }

  const hex = normalized.length === 8 ? normalized.slice(0, 6) : normalized.slice(0, 6);
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return {
    r: Number.isNaN(r) ? 17 : r,
    g: Number.isNaN(g) ? 17 : g,
    b: Number.isNaN(b) ? 17 : b
  };
}

function toHex(value: number): string {
  return Math.min(255, Math.max(0, value)).toString(16).padStart(2, '0');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function asRecord(input: unknown): Record<string, unknown> | undefined {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return undefined;
}

function toArray(input: unknown): unknown[] {
  return Array.isArray(input) ? input : [];
}

function toStringValue(input: unknown): string | undefined {
  if (typeof input === 'string') {
    return input.trim();
  }
  if (typeof input === 'number') {
    return String(input);
  }
  return undefined;
}

function toStringArray(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .map((item) => toStringValue(item) ?? '')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  const value = toStringValue(input);
  if (!value) {
    return [];
  }

  return [value];
}

function toBooleanValue(input: unknown, fallback: boolean): boolean {
  if (typeof input === 'boolean') {
    return input;
  }
  return fallback;
}

function joinTimeRange(start?: string, end?: string): string | undefined {
  if (!start && !end) {
    return undefined;
  }
  return [start, end].filter(Boolean).join(' - ');
}
