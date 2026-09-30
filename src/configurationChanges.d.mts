export type ConfigurationState = Record<string, unknown> | null;
export type ConfigurationChangeEntry = {
  path: string;
  before: ConfigurationState;
  after: ConfigurationState;
};
export function configurationAuditChanges(entries: ConfigurationChangeEntry[]): Record<string, { before: ConfigurationState; after: ConfigurationState }>;
