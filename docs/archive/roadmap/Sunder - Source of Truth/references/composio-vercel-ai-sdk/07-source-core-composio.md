# Composio Core SDK — composio.ts

> Source: Cloned repo `ComposioHQ/composio`
> Path: `ts/packages/core/src/composio.ts`
> Version: 0.6.4

## Full Source (410 lines)

```typescript
import type { BaseComposioProvider } from './provider/BaseProvider';
import ComposioClient from '@composio/client';
import { Tools } from './models/Tools';
import { Toolkits } from './models/Toolkits';
import { Triggers } from './models/Triggers';
import { AuthConfigs } from './models/AuthConfigs';
import { ConnectedAccounts } from './models/ConnectedAccounts';
import { MCP } from './models/MCP';
import { telemetry } from './telemetry/Telemetry';
import { getSDKConfig, getToolkitVersionsFromEnv } from './utils/sdk';
import logger from './utils/logger';
import { COMPOSIO_LOG_LEVEL, IS_DEVELOPMENT_OR_CI } from './utils/constants';
import { checkForLatestVersionFromNPM } from './utils/version';
import { OpenAIProvider } from './provider/OpenAIProvider';
import { version } from '../package.json';
import type { ComposioRequestHeaders } from './types/composio.types';
import { Files } from '#files';
import { getDefaultHeaders } from './utils/session';
import { ToolkitVersionParam } from './types/tool.types';
import { ToolRouter } from './models/ToolRouter';
import { ToolRouterCreateSessionConfig, ToolRouterSession } from './types/toolRouter.types';
import { CONFIG_DEFAULTS } from './utils/config-defaults';

export type ComposioConfig<
  TProvider extends BaseComposioProvider<unknown, unknown, unknown> = OpenAIProvider,
> = {
  apiKey?: string | null;
  baseURL?: string | null;
  allowTracking?: boolean;
  autoUploadDownloadFiles?: boolean;
  provider?: TProvider;
  host?: string;
  defaultHeaders?: ComposioRequestHeaders;
  disableVersionCheck?: boolean;
  toolkitVersions?: ToolkitVersionParam;
};

export class Composio<
  TProvider extends BaseComposioProvider<unknown, unknown, unknown> = OpenAIProvider,
> {
  protected client: ComposioClient;
  private config: ComposioConfig<TProvider>;

  /** List, retrieve, and execute tools */
  tools: Tools<unknown, unknown, TProvider>;
  /** Retrieve toolkit metadata and authorize user connections */
  toolkits: Toolkits;
  /** Manage webhook triggers and event subscriptions */
  triggers: Triggers<TProvider>;
  /** The tool provider instance used for wrapping tools in framework-specific formats */
  provider: TProvider;
  /** Upload and download files */
  files: Files;
  /** Manage authentication configurations for toolkits */
  authConfigs: AuthConfigs;
  /** Manage authenticated connections */
  connectedAccounts: ConnectedAccounts;
  /** Model Context Protocol server management */
  mcp: MCP;
  /** @experimental */
  toolRouter: ToolRouter<unknown, unknown, TProvider>;

  /**
   * Creates a new tool router session for a user.
   * @param userId The user id to create the session for
   * @param config The config for the tool router session
   */
  create: (
    userId: string,
    routerConfig?: ToolRouterCreateSessionConfig
  ) => Promise<ToolRouterSession<unknown, unknown, TProvider>>;

  /**
   * Use an existing tool router session
   * @param id The id of the session to use
   */
  use: (id: string) => Promise<ToolRouterSession<unknown, unknown, TProvider>>;

  constructor(config?: ComposioConfig<TProvider>) {
    const { baseURL: baseURLParsed, apiKey: apiKeyParsed } = getSDKConfig(
      config?.baseURL,
      config?.apiKey
    );

    this.provider = (config?.provider ?? new OpenAIProvider()) as TProvider;
    this.config = {
      ...config,
      baseURL: baseURLParsed,
      apiKey: apiKeyParsed,
      toolkitVersions: getToolkitVersionsFromEnv(config?.toolkitVersions),
      allowTracking: config?.allowTracking ?? CONFIG_DEFAULTS.allowTracking,
      autoUploadDownloadFiles:
        config?.autoUploadDownloadFiles ?? CONFIG_DEFAULTS.autoUploadDownloadFiles,
      provider: config?.provider ?? this.provider,
    };

    const defaultHeaders = getDefaultHeaders(this.config.defaultHeaders, this.provider);

    this.client = new ComposioClient({
      apiKey: apiKeyParsed,
      baseURL: baseURLParsed,
      defaultHeaders: defaultHeaders,
      logLevel: COMPOSIO_LOG_LEVEL,
    });

    this.tools = new Tools(this.client, this.config);
    this.mcp = new MCP(this.client);
    this.toolkits = new Toolkits(this.client);
    this.triggers = new Triggers(this.client, this.config);
    this.authConfigs = new AuthConfigs(this.client);
    this.files = new Files(this.client);
    this.connectedAccounts = new ConnectedAccounts(this.client);
    this.toolRouter = new ToolRouter(this.client, this.config);

    // Bind tool router methods
    this.create = this.toolRouter.create.bind(this.toolRouter);
    this.use = this.toolRouter.use.bind(this.toolRouter);

    // Telemetry
    if (this.config.allowTracking) {
      telemetry.setup({ /* ... */ });
    }
    telemetry.instrument(this, 'Composio');
    telemetry.instrument(this.provider, this.provider.name ?? 'unknown');

    if (!this.config.disableVersionCheck) {
      checkForLatestVersionFromNPM(version);
    }
  }

  getClient(): ComposioClient { return this.client; }
  getConfig(): ComposioConfig<TProvider> { return this.config; }

  /** @deprecated */
  createSession(options?: { headers?: ComposioRequestHeaders }): Composio<TProvider> {
    const sessionHeaders = getDefaultHeaders(options?.headers, this.provider);
    return new Composio({ ...this.config, defaultHeaders: sessionHeaders });
  }

  async flush(): Promise<void> { await telemetry.flush(); }
}
```

## Key API Surface

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `tools` | `Tools<...>` | List, retrieve, execute tools |
| `toolkits` | `Toolkits` | Toolkit metadata + `authorize()` compound flow |
| `connectedAccounts` | `ConnectedAccounts` | OAuth connection lifecycle |
| `authConfigs` | `AuthConfigs` | Auth config management |
| `provider` | `TProvider` | Framework-specific provider (VercelProvider) |
| `mcp` | `MCP` | MCP server management |
| `files` | `Files` | File upload/download |
| `triggers` | `Triggers` | Webhook triggers |

### Methods

| Method | Description |
|--------|-------------|
| `create(userId, config?)` | Create tool router session (meta-tools) |
| `use(sessionId)` | Resume existing session |

### ConnectedAccounts API

```typescript
// Three levels of OAuth initiation:
composio.toolkits.authorize(userId, 'github')                    // Compound (simplest)
composio.connectedAccounts.link(userId, authConfigId)             // Mid-level
composio.connectedAccounts.initiate(userId, authConfigId, opts)   // Full control

// Management
composio.connectedAccounts.list({ userIds, toolkitSlugs, statuses })
composio.connectedAccounts.get(connectedAccountId)
composio.connectedAccounts.refresh(connectedAccountId)
composio.connectedAccounts.enable(connectedAccountId)
composio.connectedAccounts.disable(connectedAccountId)
composio.connectedAccounts.delete(connectedAccountId)

// Wait for OAuth completion
connectionRequest.waitForConnection(timeoutMs?)
connectionRequest.redirectUrl  // URL to redirect user to
```

### Tools API

```typescript
// Get tools formatted for framework (VercelProvider → Vercel AI SDK tools)
composio.tools.get(userId, { toolkits: ['gmail'] })
composio.tools.get(userId, 'GMAIL_SEND_EMAIL')
composio.tools.get(userId, { toolkits: ['gmail'] }, { beforeExecute, afterExecute })

// Execute tool directly
composio.tools.execute('GMAIL_SEND_EMAIL', {
  userId,
  arguments: { to: '...', subject: '...' },
  version: '20250909_00',
})
```
