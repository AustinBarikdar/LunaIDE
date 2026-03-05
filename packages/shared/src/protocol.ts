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
  | 'get_instance_properties'
  | 'is_running'
  | 'run_code'
  | 'get_studio_mode'
  | 'insert_model'
  | 'get_selection'
  | 'set_selection'
  | 'create_instance'
  | 'delete_instance'
  | 'set_instance_properties'
  | 'move_rename_instance'
  | 'manage_tags';

export interface StudioOutputEntry {
  timestamp: number;
  messageType: 'MessageOutput' | 'MessageInfo' | 'MessageWarning' | 'MessageError';
  message: string;
}

export interface StudioInstanceNode {
  name: string;
  className: string;
  children: StudioInstanceNode[];
  properties?: Record<string, unknown>;
}

