import { useState, useEffect, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card } from '@/components/ui/Card';
import { Hash, Plus, Loader2, Users, X, AlertCircle, Search, Globe, Lock, Crown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { teamsApi } from '@/lib/api';
import type { Team } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/useAuthStore';
import { TeamDetailView } from '@/components/teams/TeamDetailView';
import { cn } from '@/lib/utils';

type Tab = 'my-teams' | 'discover';

export default function TeamsScreen() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<Tab>('my-teams');
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);

  // Create team modal
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [newTeam, setNewTeam] = useState({ name: '', tag: '', description: '', isPublic: true });

  // Discover tab
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Team[]>([]);
  const [searching, setSearching] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadTeams();
  }, []);

  // Discover search — debounced
  useEffect(() => {
    if (tab !== 'discover') return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      handleSearch(searchQuery);
    }, 400);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery, tab]);

  // Load discover results on tab switch
  useEffect(() => {
    if (tab === 'discover') handleSearch('');
  }, [tab]);

  const loadTeams = async () => {
    setLoading(true);
    try {
      const data = await teamsApi.list();
      setTeams(data);
    } catch (err) {
      console.error('Failed to load teams:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (q: string) => {
    setSearching(true);
    try {
      const results = await teamsApi.search(q);
      // Filter out already-joined teams
      const myTeamIds = new Set(teams.map(t => t._id));
      setSearchResults(results.filter(t => !myTeamIds.has(t._id)));
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeam.name || !newTeam.tag) return;
    setCreating(true);
    setCreateError('');
    try {
      const team = await teamsApi.create({
        name: newTeam.name,
        tag: newTeam.tag.toUpperCase(),
        description: newTeam.description || undefined,
        isPublic: newTeam.isPublic,
      });
      setTeams(prev => [team, ...prev]);
      setShowCreate(false);
      setNewTeam({ name: '', tag: '', description: '', isPublic: true });
      // Open the created team immediately
      setActiveTeam(team);
    } catch (err: any) {
      setCreateError(err.response?.data?.error || err.message || 'Failed to create team');
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (teamId: string) => {
    setJoiningId(teamId);
    try {
      await teamsApi.join(teamId);
      // Refresh joined teams & remove from discover results
      const freshTeams = await teamsApi.list();
      setTeams(freshTeams);
      setSearchResults(prev => prev.filter(t => t._id !== teamId));
      // Switch to my teams tab
      setTab('my-teams');
    } catch (err: any) {
      console.error('Join failed:', err);
    } finally {
      setJoiningId(null);
    }
  };

  const getMyRole = (team: Team) => {
    const m = team.members.find(m => {
      const uid = typeof m.userId === 'string' ? m.userId : (m.userId as any)?._id;
      return uid === user?.id;
    });
    return m?.role || 'MEMBER';
  };

  // If a team is open, show the workspace
  if (activeTeam) {
    return (
      <AppLayout fullHeight>
        <TeamDetailView
          team={activeTeam}
          onBack={() => setActiveTeam(null)}
          onTeamDeleted={() => {
            setTeams(prev => prev.filter(t => t._id !== activeTeam._id));
            setActiveTeam(null);
          }}
          onTeamLeft={() => {
            setTeams(prev => prev.filter(t => t._id !== activeTeam._id));
            setActiveTeam(null);
          }}
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-8 max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold font-heading mb-2">Teams</h1>
            <p className="text-text-secondary">Your collaborative spaces and deep-dive groups.</p>
          </div>
          <Button className="gap-2" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /> New Team
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-bg-secondary border border-border-subtle w-fit">
          {([
            { key: 'my-teams', label: 'My Teams', icon: <Users className="w-4 h-4" /> },
            { key: 'discover', label: 'Discover', icon: <Search className="w-4 h-4" /> },
          ] as { key: Tab; label: string; icon: React.ReactNode }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                tab === t.key
                  ? 'bg-accent-primary text-white shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* ── My Teams Tab ── */}
        {tab === 'my-teams' && (
          <>
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 text-accent-primary animate-spin" />
              </div>
            ) : teams.length === 0 ? (
              <div className="text-center py-20 space-y-4">
                <div className="w-20 h-20 rounded-2xl bg-bg-secondary border border-border-subtle flex items-center justify-center mx-auto">
                  <Hash className="w-10 h-10 text-text-muted/30" />
                </div>
                <p className="text-text-secondary">You're not in any teams yet.</p>
                <div className="flex gap-2 justify-center">
                  <Button onClick={() => setShowCreate(true)} className="gap-2">
                    <Plus className="w-4 h-4" /> Create Team
                  </Button>
                  <Button variant="ghost" onClick={() => setTab('discover')} className="gap-2">
                    <Search className="w-4 h-4" /> Discover Teams
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
                {teams.map(team => {
                  const role = getMyRole(team);
                  return (
                    <motion.div
                      key={team._id}
                      whileHover={{ y: -2 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                    >
                      <Card
                        glass
                        className="p-6 group cursor-pointer hover:border-accent-primary/50 transition-all duration-200 border border-border-subtle"
                        onClick={() => setActiveTeam(team)}
                      >
                        {/* Banner preview */}
                        {team.bannerUrl && (
                          <div
                            className="w-full h-20 rounded-xl mb-4 bg-cover bg-center"
                            style={{ backgroundImage: `url(${team.bannerUrl})` }}
                          />
                        )}

                        <div className="flex items-start justify-between mb-4">
                          <div className="w-12 h-12 bg-accent-primary/20 rounded-xl flex items-center justify-center text-accent-glow border border-accent-primary/30">
                            <Hash className="w-6 h-6" />
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Role badge */}
                            {role === 'OWNER' && (
                              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-accent-amber/15 text-accent-amber border border-accent-amber/30 font-medium">
                                <Crown className="w-2.5 h-2.5" /> Owner
                              </span>
                            )}
                            {/* Public/Private */}
                            <span className="text-[10px] text-text-muted flex items-center gap-1">
                              {team.isPublic ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                              {team.isPublic ? 'Public' : 'Private'}
                            </span>
                            {/* Tag */}
                            <span className="text-xs font-mono bg-bg-secondary px-2 py-0.5 rounded-md text-text-secondary border border-border-subtle">
                              #{team.tag}
                            </span>
                          </div>
                        </div>

                        <h3 className="text-lg font-bold mb-1 group-hover:text-accent-primary transition-colors">{team.name}</h3>
                        <p className="text-sm text-text-muted mb-4 line-clamp-2">{team.description || 'No description'}</p>

                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                            <Users className="w-3.5 h-3.5" />
                            {team.members?.length || 0} member{team.members?.length !== 1 ? 's' : ''}
                          </div>
                          <span className="text-text-muted text-xs">·</span>
                          <span className="text-xs text-text-muted">
                            {new Date(team.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </Card>
                    </motion.div>
                  );
                })}

                {/* Add New Card */}
                <Card
                  className="p-6 flex flex-col items-center justify-center text-center h-[200px] border-dashed border-2 border-border-subtle bg-transparent hover:bg-bg-secondary/50 cursor-pointer transition-colors group"
                  onClick={() => setShowCreate(true)}
                >
                  <div className="w-12 h-12 rounded-full bg-bg-secondary group-hover:bg-accent-primary/20 flex items-center justify-center mb-4 transition-colors">
                    <Plus className="w-6 h-6 text-text-muted group-hover:text-accent-glow transition-colors" />
                  </div>
                  <p className="text-text-primary font-medium">Create New Team</p>
                </Card>
              </div>
            )}
          </>
        )}

        {/* ── Discover Tab ── */}
        {tab === 'discover' && (
          <div className="space-y-6">
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-border-subtle bg-bg-secondary text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:border-accent-primary transition-colors"
                placeholder="Search teams by name or tag..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoFocus
              />
              {searching && (
                <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted animate-spin" />
              )}
            </div>

            {/* Results */}
            {searchResults.length === 0 && !searching ? (
              <div className="text-center py-12">
                <Globe className="w-12 h-12 text-text-muted/30 mx-auto mb-3" />
                <p className="text-text-muted text-sm">
                  {searchQuery ? 'No public teams found matching your search.' : 'No public teams available.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {searchResults.map(team => (
                  <motion.div
                    key={team._id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                  >
                    <Card glass className="p-5 border border-border-subtle flex flex-col gap-4">
                      <div className="flex items-start gap-3">
                        <div className="w-11 h-11 bg-accent-primary/15 rounded-xl flex items-center justify-center border border-accent-primary/20 shrink-0">
                          <Hash className="w-5 h-5 text-accent-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-sm truncate">{team.name}</h3>
                            <span className="text-[10px] font-mono bg-bg-secondary px-1.5 py-0.5 rounded text-text-muted border border-border-subtle">#{team.tag}</span>
                          </div>
                          <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{team.description || 'No description'}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                          <Users className="w-3.5 h-3.5" />
                          {team.members?.length || 0} members
                        </div>
                        <button
                          onClick={() => handleJoin(team._id)}
                          disabled={joiningId === team._id}
                          className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                            joiningId === team._id
                              ? 'bg-bg-secondary text-text-muted cursor-not-allowed'
                              : 'bg-accent-primary text-white hover:bg-accent-primary/80'
                          )}
                        >
                          {joiningId === team._id ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Joining...</>
                          ) : (
                            <><Plus className="w-3.5 h-3.5" /> Join</>
                          )}
                        </button>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Create Team Modal ── */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowCreate(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <Card glass className="p-8 w-full max-w-md space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-accent-primary/20 flex items-center justify-center">
                      <Hash className="w-5 h-5 text-accent-primary" />
                    </div>
                    <h2 className="text-xl font-bold">Create New Team</h2>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setShowCreate(false)}>
                    <X className="w-5 h-5" />
                  </Button>
                </div>

                {createError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {createError}
                  </div>
                )}

                <form onSubmit={handleCreate} className="space-y-4">
                  <Input
                    type="text"
                    placeholder="Team Name"
                    value={newTeam.name}
                    onChange={e => setNewTeam(prev => ({ ...prev, name: e.target.value }))}
                    required
                    autoFocus
                  />
                  <div className="space-y-1">
                    <Input
                      type="text"
                      placeholder="Tag (e.g. CGPIT)"
                      value={newTeam.tag}
                      onChange={e => setNewTeam(prev => ({ ...prev, tag: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))}
                      required
                    />
                    {newTeam.tag && (
                      <p className="text-xs text-text-muted pl-1">Preview: <span className="text-accent-primary font-mono">#{newTeam.tag}</span></p>
                    )}
                  </div>
                  <textarea
                    className="w-full h-20 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:border-accent-primary resize-none transition-colors"
                    placeholder="Description (optional)"
                    value={newTeam.description}
                    onChange={e => setNewTeam(prev => ({ ...prev, description: e.target.value }))}
                  />

                  {/* Public/Private toggle */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary border border-border-subtle">
                    <div className="flex items-center gap-2">
                      {newTeam.isPublic ? <Globe className="w-4 h-4 text-text-secondary" /> : <Lock className="w-4 h-4 text-text-secondary" />}
                      <div>
                        <p className="text-sm font-medium">{newTeam.isPublic ? 'Public' : 'Private'}</p>
                        <p className="text-xs text-text-muted">{newTeam.isPublic ? 'Anyone can find and join' : 'Invite only'}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNewTeam(prev => ({ ...prev, isPublic: !prev.isPublic }))}
                      className={cn(
                        'relative w-11 h-6 rounded-full transition-colors shrink-0',
                        newTeam.isPublic ? 'bg-accent-primary' : 'bg-bg-elevated border border-border-subtle'
                      )}
                    >
                      <div className={cn(
                        'absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform',
                        newTeam.isPublic ? 'translate-x-6' : 'translate-x-1'
                      )} />
                    </button>
                  </div>

                  <Button type="submit" className="w-full" disabled={creating}>
                    {creating ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Creating...
                      </span>
                    ) : 'Create Team'}
                  </Button>
                </form>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
