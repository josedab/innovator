/**
 * @module workspaces
 *
 * Team workspaces with shared history, member roles, and activity tracking.
 * Uses file-based persistence (JSON) in ~/.innovator/workspaces/.
 * Designed for SQLite migration later.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SessionRecord } from "../types.js";

const WORKSPACES_DIR = join(homedir(), ".innovator", "workspaces");

/**
 * Ensure a directory exists, creating it recursively if necessary.
 *
 * @param dir - Absolute path to the directory to ensure
 */
function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ---- Types ----

export type MemberRole = "admin" | "contributor" | "viewer";

export const WorkspaceMemberSchema = z.object({
  userId: z.string().min(1).max(200),
  displayName: z.string().min(1).max(200),
  email: z.string().email().optional(),
  role: z.enum(["admin", "contributor", "viewer"]),
  joinedAt: z.string(),
  avatarUrl: z.string().url().optional(),
});

export type WorkspaceMember = z.infer<typeof WorkspaceMemberSchema>;

export const ActivityEventSchema = z.object({
  id: z.string(),
  type: z.enum([
    "workspace_created",
    "member_joined",
    "member_left",
    "member_role_changed",
    "session_added",
    "session_tagged",
    "preset_shared",
    "angle_shared",
  ]),
  userId: z.string(),
  displayName: z.string(),
  details: z.string().max(1000),
  timestamp: z.string(),
});

export type ActivityEvent = z.infer<typeof ActivityEventSchema>;

export const WorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  ownerId: z.string(),
  members: z.array(WorkspaceMemberSchema),
  sessionIds: z.array(z.string()),
  sharedPresetIds: z.array(z.string()).optional(),
  sharedAngleIds: z.array(z.string()).optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
  activityFeed: z.array(ActivityEventSchema).optional(),
});

export type Workspace = z.infer<typeof WorkspaceSchema>;

// ---- Persistence helpers ----

function workspacePath(id: string): string {
  return join(WORKSPACES_DIR, `${id}.json`);
}

function readWorkspace(id: string): Workspace | undefined {
  try {
    const path = workspacePath(id);
    if (!existsSync(path)) return undefined;
    return WorkspaceSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
  } catch {
    return undefined;
  }
}

function writeWorkspace(workspace: Workspace): void {
  ensureDir(WORKSPACES_DIR);
  writeFileSync(workspacePath(workspace.id), JSON.stringify(workspace, null, 2), "utf-8");
}

function addActivity(workspace: Workspace, event: Omit<ActivityEvent, "id" | "timestamp">): void {
  if (!workspace.activityFeed) workspace.activityFeed = [];
  workspace.activityFeed.unshift({
    ...event,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
  });
  // Keep last 200 events
  if (workspace.activityFeed.length > 200) {
    workspace.activityFeed = workspace.activityFeed.slice(0, 200);
  }
}

// ---- CRUD ----

/**
 * Create a new team workspace with the given owner as the initial admin member.
 *
 * The workspace is persisted as a JSON file in `~/.innovator/workspaces/`.
 *
 * @param params - Workspace creation parameters
 * @param params.name - Display name for the workspace
 * @param params.description - Optional description of the workspace purpose
 * @param params.ownerId - Unique identifier for the workspace owner
 * @param params.ownerDisplayName - Display name of the owner
 * @param params.ownerEmail - Optional email of the owner
 * @returns The newly created {@link Workspace}
 */
export function createWorkspace(params: {
  name: string;
  description?: string;
  ownerId: string;
  ownerDisplayName: string;
  ownerEmail?: string;
}): Workspace {
  const now = new Date().toISOString();
  const workspace: Workspace = {
    id: randomUUID(),
    name: params.name,
    description: params.description,
    createdAt: now,
    updatedAt: now,
    ownerId: params.ownerId,
    members: [
      {
        userId: params.ownerId,
        displayName: params.ownerDisplayName,
        email: params.ownerEmail,
        role: "admin",
        joinedAt: now,
      },
    ],
    sessionIds: [],
    sharedPresetIds: [],
    sharedAngleIds: [],
    tags: [],
    activityFeed: [],
  };

  addActivity(workspace, {
    type: "workspace_created",
    userId: params.ownerId,
    displayName: params.ownerDisplayName,
    details: `Created workspace "${params.name}"`,
  });

  writeWorkspace(workspace);
  return workspace;
}

/**
 * Get a workspace by its UUID.
 *
 * @param id - The UUID of the workspace
 * @returns The {@link Workspace}, or `undefined` if not found or corrupt
 */
export function getWorkspace(id: string): Workspace | undefined {
  return readWorkspace(id);
}

/**
 * Update workspace metadata (name, description, or tags).
 *
 * @param id - The UUID of the workspace to update
 * @param updates - Fields to update (all optional)
 * @returns `true` if the workspace was found and updated, `false` otherwise
 */
export function updateWorkspace(
  id: string,
  updates: { name?: string; description?: string; tags?: string[] }
): boolean {
  const ws = readWorkspace(id);
  if (!ws) return false;
  if (updates.name !== undefined) ws.name = updates.name;
  if (updates.description !== undefined) ws.description = updates.description;
  if (updates.tags !== undefined) ws.tags = updates.tags;
  ws.updatedAt = new Date().toISOString();
  writeWorkspace(ws);
  return true;
}

/**
 * Delete a workspace by removing its JSON file from disk.
 *
 * @param id - The UUID of the workspace to delete
 * @returns `true` if the workspace file existed and was removed
 */
export function deleteWorkspace(id: string): boolean {
  const path = workspacePath(id);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}

/**
 * List all workspaces, sorted by most recently updated first.
 *
 * Reads all JSON files from `~/.innovator/workspaces/` and returns
 * valid workspace records. Corrupt files are silently skipped.
 *
 * @returns Array of {@link Workspace} sorted by `updatedAt` descending
 */
export function listWorkspaces(): Workspace[] {
  ensureDir(WORKSPACES_DIR);
  const files = readdirSync(WORKSPACES_DIR).filter((f) => f.endsWith(".json"));
  const workspaces: Workspace[] = [];
  for (const file of files) {
    try {
      const raw = readFileSync(join(WORKSPACES_DIR, file), "utf-8");
      workspaces.push(WorkspaceSchema.parse(JSON.parse(raw)));
    } catch {
      // Skip corrupt files
    }
  }
  return workspaces.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * List all workspaces that a specific user belongs to.
 *
 * @param userId - The user ID to filter by
 * @returns Array of {@link Workspace} where the user is a member
 */
export function listUserWorkspaces(userId: string): Workspace[] {
  return listWorkspaces().filter((ws) => ws.members.some((m) => m.userId === userId));
}

// ---- Members ----

/**
 * Add a member to a workspace.
 *
 * @param workspaceId - The UUID of the workspace
 * @param member - Member details including userId, displayName, role, and optional email
 * @param invitedBy - The user performing the invitation (for activity tracking)
 * @returns `true` if the member was added, `false` if workspace not found or user already a member
 */
export function addMember(
  workspaceId: string,
  member: { userId: string; displayName: string; email?: string; role: MemberRole },
  invitedBy: { userId: string; displayName: string }
): boolean {
  const ws = readWorkspace(workspaceId);
  if (!ws) return false;

  if (ws.members.some((m) => m.userId === member.userId)) return false;

  ws.members.push({
    ...member,
    joinedAt: new Date().toISOString(),
  });

  addActivity(ws, {
    type: "member_joined",
    userId: invitedBy.userId,
    displayName: invitedBy.displayName,
    details: `${member.displayName} joined as ${member.role}`,
  });

  ws.updatedAt = new Date().toISOString();
  writeWorkspace(ws);
  return true;
}

/**
 * Remove a member from a workspace.
 *
 * @param workspaceId - The UUID of the workspace
 * @param userId - The user ID to remove
 * @param removedBy - The user performing the removal (for activity tracking)
 * @returns `true` if the member was found and removed, `false` otherwise
 */
export function removeMember(
  workspaceId: string,
  userId: string,
  removedBy: { userId: string; displayName: string }
): boolean {
  const ws = readWorkspace(workspaceId);
  if (!ws) return false;

  const idx = ws.members.findIndex((m) => m.userId === userId);
  if (idx === -1) return false;

  const removed = ws.members[idx];
  ws.members.splice(idx, 1);

  addActivity(ws, {
    type: "member_left",
    userId: removedBy.userId,
    displayName: removedBy.displayName,
    details: `${removed.displayName} was removed`,
  });

  ws.updatedAt = new Date().toISOString();
  writeWorkspace(ws);
  return true;
}

/**
 * Update a workspace member's role.
 *
 * @param workspaceId - The UUID of the workspace
 * @param userId - The member whose role is being changed
 * @param newRole - The new {@link MemberRole} (`"admin"`, `"contributor"`, or `"viewer"`)
 * @param changedBy - The user performing the change (for activity tracking)
 * @returns `true` if the role was updated, `false` if workspace or member not found
 */
export function updateMemberRole(
  workspaceId: string,
  userId: string,
  newRole: MemberRole,
  changedBy: { userId: string; displayName: string }
): boolean {
  const ws = readWorkspace(workspaceId);
  if (!ws) return false;

  const member = ws.members.find((m) => m.userId === userId);
  if (!member) return false;

  const oldRole = member.role;
  member.role = newRole;

  addActivity(ws, {
    type: "member_role_changed",
    userId: changedBy.userId,
    displayName: changedBy.displayName,
    details: `${member.displayName} role changed from ${oldRole} to ${newRole}`,
  });

  ws.updatedAt = new Date().toISOString();
  writeWorkspace(ws);
  return true;
}

/**
 * Check if a user has at least the specified permission level in a workspace.
 *
 * Role hierarchy: `admin` (3) > `contributor` (2) > `viewer` (1).
 *
 * @param workspaceId - The UUID of the workspace
 * @param userId - The user to check
 * @param requiredRole - The minimum {@link MemberRole} required
 * @returns `true` if the user's role meets or exceeds the required level
 */
export function hasPermission(
  workspaceId: string,
  userId: string,
  requiredRole: MemberRole
): boolean {
  const ws = readWorkspace(workspaceId);
  if (!ws) return false;

  const member = ws.members.find((m) => m.userId === userId);
  if (!member) return false;

  const roleHierarchy: Record<MemberRole, number> = {
    admin: 3,
    contributor: 2,
    viewer: 1,
  };

  return roleHierarchy[member.role] >= roleHierarchy[requiredRole];
}

// ---- Sessions ----

/**
 * Add an innovation session to a workspace.
 *
 * @param workspaceId - The UUID of the workspace
 * @param sessionId - The session ID to add
 * @param addedBy - The user adding the session (for activity tracking)
 * @returns `true` if the session was added, `false` if workspace not found or session already added
 */
export function addSessionToWorkspace(
  workspaceId: string,
  sessionId: string,
  addedBy: { userId: string; displayName: string }
): boolean {
  const ws = readWorkspace(workspaceId);
  if (!ws) return false;

  if (ws.sessionIds.includes(sessionId)) return false;
  ws.sessionIds.push(sessionId);

  addActivity(ws, {
    type: "session_added",
    userId: addedBy.userId,
    displayName: addedBy.displayName,
    details: `Added session ${sessionId.slice(0, 8)}`,
  });

  ws.updatedAt = new Date().toISOString();
  writeWorkspace(ws);
  return true;
}

/**
 * Search sessions within a workspace by text query.
 *
 * Searches across subject, investigation summary, tags, and idea titles/descriptions.
 *
 * @param workspaceId - The UUID of the workspace
 * @param query - Case-insensitive text query
 * @param getSessionFn - Callback to resolve session IDs to {@link SessionRecord} objects
 * @returns Array of matching sessions sorted by creation date (newest first)
 */
export function searchWorkspaceSessions(
  workspaceId: string,
  query: string,
  getSessionFn: (id: string) => SessionRecord | undefined
): SessionRecord[] {
  const ws = readWorkspace(workspaceId);
  if (!ws) return [];

  const lowerQuery = query.toLowerCase();
  const sessions: SessionRecord[] = [];

  for (const sid of ws.sessionIds) {
    const session = getSessionFn(sid);
    if (!session) continue;

    const match =
      session.subject.toLowerCase().includes(lowerQuery) ||
      session.investigation?.summary?.toLowerCase().includes(lowerQuery) ||
      session.tags.some((t) => t.toLowerCase().includes(lowerQuery)) ||
      session.angleResults.some((ar) =>
        ar.ideas.some(
          (idea) =>
            idea.title.toLowerCase().includes(lowerQuery) ||
            idea.description.toLowerCase().includes(lowerQuery)
        )
      );

    if (match) sessions.push(session);
  }

  return sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Get the activity feed for a workspace.
 *
 * @param workspaceId - The UUID of the workspace
 * @param limit - Maximum number of events to return (default: 50)
 * @returns Array of {@link ActivityEvent} sorted by most recent first
 */
export function getActivityFeed(workspaceId: string, limit: number = 50): ActivityEvent[] {
  const ws = readWorkspace(workspaceId);
  if (!ws) return [];
  return (ws.activityFeed ?? []).slice(0, limit);
}

// ---- Shared resources ----

/**
 * Share a pipeline preset with all members of a workspace.
 *
 * @param workspaceId - The UUID of the workspace
 * @param presetId - The preset ID to share
 * @param sharedBy - The user sharing the preset (for activity tracking)
 * @returns `true` if the preset was shared, `false` if workspace not found or already shared
 */
export function sharePreset(
  workspaceId: string,
  presetId: string,
  sharedBy: { userId: string; displayName: string }
): boolean {
  const ws = readWorkspace(workspaceId);
  if (!ws) return false;
  if (!ws.sharedPresetIds) ws.sharedPresetIds = [];
  if (ws.sharedPresetIds.includes(presetId)) return false;
  ws.sharedPresetIds.push(presetId);

  addActivity(ws, {
    type: "preset_shared",
    userId: sharedBy.userId,
    displayName: sharedBy.displayName,
    details: `Shared preset ${presetId}`,
  });

  ws.updatedAt = new Date().toISOString();
  writeWorkspace(ws);
  return true;
}

/**
 * Share a custom innovation angle with all members of a workspace.
 *
 * @param workspaceId - The UUID of the workspace
 * @param angleId - The custom angle ID to share
 * @param sharedBy - The user sharing the angle (for activity tracking)
 * @returns `true` if the angle was shared, `false` if workspace not found or already shared
 */
export function shareAngle(
  workspaceId: string,
  angleId: string,
  sharedBy: { userId: string; displayName: string }
): boolean {
  const ws = readWorkspace(workspaceId);
  if (!ws) return false;
  if (!ws.sharedAngleIds) ws.sharedAngleIds = [];
  if (ws.sharedAngleIds.includes(angleId)) return false;
  ws.sharedAngleIds.push(angleId);

  addActivity(ws, {
    type: "angle_shared",
    userId: sharedBy.userId,
    displayName: sharedBy.displayName,
    details: `Shared angle ${angleId}`,
  });

  ws.updatedAt = new Date().toISOString();
  writeWorkspace(ws);
  return true;
}
