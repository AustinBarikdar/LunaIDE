/**
 * Protocol types for Studio plugin <-> IDE communication.
 * The IDE runs an HTTP server; the Studio plugin polls for commands and posts results.
 */

/** Command sent from IDE to Studio plugin (retrieved via GET /commands) */
export interface StudioCommand {
  id: string;
  type: StudioCommandType;
  payload: Record<string, unknown>;
}

export type StudioCommandType =
  | 'start_playtest'
  | 'stop_playtest'
  | 'inject_script'
  | 'get_instances'
  | 'get_output'
  | 'get_children'
  | 'get_instance_properties';

export interface StudioOutputEntry {
  timestamp: number;
  messageType: 'MessageOutput' | 'MessageInfo' | 'MessageWarning' | 'MessageError';
  message: string;
}

/** Instance tree data posted from Studio plugin to IDE */
export interface StudioInstanceTree {
  studioId: string;
  root: StudioInstanceNode;
}

export interface StudioInstanceNode {
  name: string;
  className: string;
  children: StudioInstanceNode[];
  properties?: Record<string, unknown>;
}

export interface BridgeResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}
