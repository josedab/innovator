"use client";

import { useEffect, useState } from "react";

interface DashboardStats {
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  failedSessions: number;
  totalUsers: number;
}

interface RecentSession {
  id: string;
  subject: string;
  status: string;
  userId?: string;
  createdAt: string;
  tier: string;
}

interface AdminData {
  dashboard?: { stats?: DashboardStats };
  teams?: Array<{ id: string; name: string; slug: string; memberCount: number }>;
}

interface PlaygroundData {
  sessions?: RecentSession[];
  usage?: { sessionsToday: number; sessionsThisMonth: number; totalSessions: number };
}

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-900/30 text-yellow-300",
  running: "bg-blue-900/30 text-blue-300",
  completed: "bg-green-900/30 text-green-300",
  failed: "bg-red-900/30 text-red-300",
  expired: "bg-gray-800 text-gray-400",
};

export default function AdminPage() {
  const [adminData, setAdminData] = useState<AdminData | null>(null);
  const [playgroundData, setPlaygroundData] = useState<PlaygroundData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [adminRes, playgroundRes] = await Promise.all([
          fetch("/api/admin?view=dashboard"),
          fetch("/api/playground?user=admin"),
        ]);

        if (adminRes.ok) {
          setAdminData(await adminRes.json());
        }
        if (playgroundRes.ok) {
          setPlaygroundData(await playgroundRes.json());
        }

        if (!adminRes.ok && !playgroundRes.ok) {
          setError("Failed to load admin data — check API configuration");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error loading admin data");
      }
    }
    loadData();
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-8">
        <div className="max-w-6xl mx-auto">
          <div className="p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-300">
            Failed to load admin data: {error}
          </div>
        </div>
      </div>
    );
  }

  if (!adminData && !playgroundData) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-400">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  const stats: DashboardStats = adminData?.dashboard?.stats ?? {
    totalSessions: playgroundData?.usage?.totalSessions ?? 0,
    activeSessions: 0,
    completedSessions: 0,
    failedSessions: 0,
    totalUsers: 0,
  };

  const sessions: RecentSession[] = playgroundData?.sessions ?? [];
  const teams = adminData?.teams ?? [];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-8">🛠️ Admin Dashboard</h1>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="p-4 rounded-xl border border-gray-800 bg-gray-900/50">
            <p className="text-3xl font-bold">{stats.totalSessions}</p>
            <p className="text-sm text-gray-400">Total Sessions</p>
          </div>
          <div className="p-4 rounded-xl border border-gray-800 bg-gray-900/50">
            <p className="text-3xl font-bold text-blue-400">{stats.activeSessions}</p>
            <p className="text-sm text-gray-400">Active</p>
          </div>
          <div className="p-4 rounded-xl border border-gray-800 bg-gray-900/50">
            <p className="text-3xl font-bold text-green-400">{stats.completedSessions}</p>
            <p className="text-sm text-gray-400">Completed</p>
          </div>
          <div className="p-4 rounded-xl border border-gray-800 bg-gray-900/50">
            <p className="text-3xl font-bold text-red-400">{stats.failedSessions}</p>
            <p className="text-sm text-gray-400">Failed</p>
          </div>
          <div className="p-4 rounded-xl border border-gray-800 bg-gray-900/50">
            <p className="text-3xl font-bold text-purple-400">{stats.totalUsers}</p>
            <p className="text-sm text-gray-400">Users</p>
          </div>
        </div>

        {/* Teams */}
        {teams.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">👥 Teams</h2>
            <div className="bg-gray-900/50 rounded-xl border border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400">
                    <th className="text-left px-4 py-3">Name</th>
                    <th className="text-left px-4 py-3">Slug</th>
                    <th className="text-right px-4 py-3">Members</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team) => (
                    <tr key={team.id} className="border-b border-gray-800/50">
                      <td className="px-4 py-3 font-medium">{team.name}</td>
                      <td className="px-4 py-3 text-gray-400">{team.slug}</td>
                      <td className="px-4 py-3 text-right">{team.memberCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Recent Sessions */}
        <div>
          <h2 className="text-xl font-semibold mb-4">🕐 Recent Sessions</h2>
          {sessions.length > 0 ? (
            <div className="bg-gray-900/50 rounded-xl border border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400">
                    <th className="text-left px-4 py-3">Subject</th>
                    <th className="text-left px-4 py-3">User</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Tier</th>
                    <th className="text-right px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr key={session.id} className="border-b border-gray-800/50">
                      <td className="px-4 py-3 font-medium truncate max-w-[200px]">
                        {session.subject}
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {session.userId ?? "anonymous"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${STATUS_BADGE[session.status] ?? STATUS_BADGE.expired}`}
                        >
                          {session.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400">{session.tier}</td>
                      <td className="px-4 py-3 text-right text-gray-400">
                        {new Date(session.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500 bg-gray-900/50 rounded-xl border border-gray-800">
              <p className="text-4xl mb-4">📭</p>
              <p>No sessions yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
