export { initSupabase, getSupabase, _resetSupabase, type SupportedStorage } from './supabase';
export { initPlatform, getPlatform } from './config';
export { setDataSourceAdapter, getDataSource, type DataSourceAdapter } from './dataSource';
export { createWebSessionStorageAdapter, type StorageAdapter } from './storage';

export {
  fetchWritingProjects,
  fetchWritingProject,
  createWritingProject,
  updateWritingProject,
  deleteWritingProject,
  seedEssayProject,
  seedWelcomeProject,
  fetchHomeEssay,
  getFallbackHomeEssay,
  saveProjectContent,
  saveProjectPages,
  saveProjectPagesWithOptions,
  saveProjectHighlights,
  fetchAssistantConversation,
  saveAssistantConversation,
  startAssistantStream,
  startAnalyzeStream,
  fetchAnalyzeUsage,
  generateShortId,
  generateSlug,
  publishProject,
  unpublishProject,
  fetchPublishedEssay,
  updatePublishSettings,
} from './writing';

export { validateInviteCode, signupWithInvite, consumeInviteCode, activateTrial } from './auth';

export { fetchCurrentUsage, getProUpgradeUrl, createPortalSession } from './billing';
export type { UsageInfo } from './billing';

export { fetchMcpServers, createMcpServer, updateMcpServer, deleteMcpServer, testMcpServer } from './mcpServers';
export type { McpServer } from './mcpServers';

export { WELCOME_PAGES, WELCOME_HIGHLIGHTS } from './welcome-seed';
export {
  HOME_ADMIN_EMAIL,
  HOME_AUTHOR_NAME,
  HOME_PAGES,
  HOME_PUBLISHED_TABS,
  HOME_SHORT_ID,
  HOME_SLUG,
  HOME_SUBTITLE,
  HOME_TITLE,
} from './home-seed';

export {
  toWritingProject,
} from './writing';

export type {
  WritingStatus,
  WritingProject,
  WritingProjectRow,
  AssistantMessage,
  Highlight,
  AnalyzeLevel,
  AnalyzeUsageInfo,
  PublishedEssay,
} from './writing';
