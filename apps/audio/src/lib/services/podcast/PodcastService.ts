import { browser } from '$app/environment';
import { writable, derived } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';
import { userProfileService } from '../profile/UserProfileService';

interface Podcast {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  coverUrl: string;
  category: string;
  language: string;
  explicit: boolean;
  tags: string[];
  website?: string;
  email?: string;
  socialLinks: {
    twitter?: string;
    facebook?: string;
    instagram?: string;
    youtube?: string;
  };
  stats: PodcastStats;
  settings: PodcastSettings;
  status: 'draft' | 'published' | 'archived';
  createdAt: string;
  updatedAt: string;
}

interface Episode {
  id: string;
  podcastId: string;
  title: string;
  description: string;
  audioUrl: string;
  duration: number;
  coverUrl?: string;
  season?: number;
  episode?: number;
  type: 'full' | 'trailer' | 'bonus';
  explicit: boolean;
  publishDate: string;
  stats: EpisodeStats;
  chapters?: Chapter[];
  transcript?: Transcript;
  status: 'draft' | 'scheduled' | 'published' | 'archived';
  createdAt: string;
  updatedAt: string;
}

interface Chapter {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  imageUrl?: string;
  url?: string;
}

interface Transcript {
  id: string;
  language: string;
  format: 'srt' | 'vtt' | 'json';
  url: string;
  segments: Array<{
    startTime: number;
    endTime: number;
    text: string;
    speaker?: string;
  }>;
  isAutoGenerated: boolean;
}

interface PodcastStats {
  subscribers: number;
  totalListens: number;
  averageListenTime: number;
  completionRate: number;
  ratings: {
    average: number;
    total: number;
    distribution: Record<number, number>;
  };
  demographics?: {
    age?: Record<string, number>;
    gender?: Record<string, number>;
    location?: Record<string, number>;
    device?: Record<string, number>;
  };
}

interface EpisodeStats {
  listens: number;
  uniqueListeners: number;
  averageListenTime: number;
  completionRate: number;
  retention: Array<{
    time: number;
    listeners: number;
  }>;
  peakConcurrent: number;
  downloads: number;
}

interface PodcastSettings {
  monetization: {
    enabled: boolean;
    type: 'free' | 'premium' | 'freemium';
    subscriptionPrice?: number;
    allowDonations: boolean;
  };
  distribution: {
    platforms: Array<{
      name: string;
      url: string;
      status: 'pending' | 'active' | 'error';
    }>;
    rssEnabled: boolean;
    allowEmbed: boolean;
  };
  engagement: {
    allowComments: boolean;
    allowRatings: boolean;
    moderationEnabled: boolean;
  };
  analytics: {
    trackLocation: boolean;
    trackDevices: boolean;
    trackDemographics: boolean;
  };
}

interface PodcastUpdate {
  title?: string;
  description?: string;
  coverUrl?: string;
  category?: string;
  language?: string;
  explicit?: boolean;
  tags?: string[];
  website?: string;
  email?: string;
  socialLinks?: Podcast['socialLinks'];
  settings?: Partial<PodcastSettings>;
}

interface EpisodeUpdate {
  title?: string;
  description?: string;
  audioUrl?: string;
  duration?: number;
  coverUrl?: string;
  season?: number;
  episode?: number;
  type?: Episode['type'];
  explicit?: boolean;
  publishDate?: string;
  chapters?: Chapter[];
  status?: Episode['status'];
}

export class PodcastService {
  private static instance: PodcastService;
  private podcasts = writable<Record<string, Podcast>>({});
  private episodes = writable<Record<string, Episode[]>>({});
  private currentEpisode = writable<Episode | null>(null);
  private loading = writable(false);
  private error = writable<string | null>(null);
  private realtimeSubscription: any = null;

  private constructor() {
    if (browser) {
      this.init();
    }
  }

  static getInstance(): PodcastService {
    if (!PodcastService.instance) {
      PodcastService.instance = new PodcastService();
    }
    return PodcastService.instance;
  }

  private async init() {
    try {
      // Setup realtime subscriptions
      this.setupRealtimeSubscription();

      // Load creator's podcasts if authenticated
      const profile = userProfileService.getProfile();
      if (profile) {
        await this.loadCreatorPodcasts(profile.id);
      }
    } catch (error) {
      console.error('Podcast service initialization failed:', error);
      this.error.set('Failed to initialize podcast service');
    }
  }

  private setupRealtimeSubscription() {
    this.realtimeSubscription = supabase
      .channel('podcast_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'podcasts'
      }, payload => this.handlePodcastChange(payload))
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'episodes'
      }, payload => this.handleEpisodeChange(payload))
      .subscribe();
  }

  private async handlePodcastChange(payload: any) {
    const { eventType, new: newPodcast, old: oldPodcast } = payload;
    
    this.podcasts.update(podcasts => {
      switch (eventType) {
        case 'INSERT':
        case 'UPDATE':
          return {
            ...podcasts,
            [newPodcast.id]: newPodcast
          };
        case 'DELETE':
          const { [oldPodcast.id]: _, ...rest } = podcasts;
          return rest;
      }
      return podcasts;
    });
  }

  private async handleEpisodeChange(payload: any) {
    const { eventType, new: newEpisode, old: oldEpisode } = payload;
    
    this.episodes.update(episodes => {
      const podcastId = newEpisode?.podcastId || oldEpisode?.podcastId;
      const podcastEpisodes = [...(episodes[podcastId] || [])];

      switch (eventType) {
        case 'INSERT':
          podcastEpisodes.push(newEpisode);
          break;
        case 'UPDATE':
          const index = podcastEpisodes.findIndex(e => e.id === newEpisode.id);
          if (index !== -1) {
            podcastEpisodes[index] = newEpisode;
          }
          break;
        case 'DELETE':
          const deleteIndex = podcastEpisodes.findIndex(e => e.id === oldEpisode.id);
          if (deleteIndex !== -1) {
            podcastEpisodes.splice(deleteIndex, 1);
          }
          break;
      }

      return {
        ...episodes,
        [podcastId]: podcastEpisodes
      };
    });
  }

  // Podcast Management
  async loadCreatorPodcasts(creatorId: string): Promise<void> {
    try {
      this.loading.set(true);
      this.error.set(null);

      const { data: podcasts, error } = await supabase
        .from('podcasts')
        .select('*')
        .eq('creator_id', creatorId);

      if (error) throw error;

      const podcastsMap = podcasts.reduce((acc, podcast) => ({
        ...acc,
        [podcast.id]: podcast
      }), {});

      this.podcasts.set(podcastsMap);
    } catch (error) {
      console.error('Failed to load podcasts:', error);
      this.error.set('Failed to load podcasts');
    } finally {
      this.loading.set(false);
    }
  }

  async createPodcast(data: Partial<Podcast>): Promise<Podcast> {
    const profile = userProfileService.getProfile();
    if (!profile) throw new Error('User not authenticated');

    try {
      this.loading.set(true);
      this.error.set(null);

      const { data: podcast, error } = await supabase
        .from('podcasts')
        .insert({
          creator_id: profile.id,
          ...data,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      return podcast;
    } catch (error) {
      console.error('Failed to create podcast:', error);
      this.error.set('Failed to create podcast');
      throw error;
    } finally {
      this.loading.set(false);
    }
  }

  async updatePodcast(podcastId: string, updates: PodcastUpdate): Promise<void> {
    try {
      this.loading.set(true);
      this.error.set(null);

      const { error } = await supabase
        .from('podcasts')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', podcastId);

      if (error) throw error;
    } catch (error) {
      console.error('Failed to update podcast:', error);
      this.error.set('Failed to update podcast');
      throw error;
    } finally {
      this.loading.set(false);
    }
  }

  async deletePodcast(podcastId: string): Promise<void> {
    try {
      this.loading.set(true);
      this.error.set(null);

      const { error } = await supabase
        .from('podcasts')
        .delete()
        .eq('id', podcastId);

      if (error) throw error;
    } catch (error) {
      console.error('Failed to delete podcast:', error);
      this.error.set('Failed to delete podcast');
      throw error;
    } finally {
      this.loading.set(false);
    }
  }

  // Episode Management
  async loadPodcastEpisodes(podcastId: string): Promise<void> {
    try {
      this.loading.set(true);
      this.error.set(null);

      const { data: episodes, error } = await supabase
        .from('episodes')
        .select('*')
        .eq('podcast_id', podcastId)
        .order('publish_date', { ascending: false });

      if (error) throw error;

      this.episodes.update(state => ({
        ...state,
        [podcastId]: episodes
      }));
    } catch (error) {
      console.error('Failed to load episodes:', error);
      this.error.set('Failed to load episodes');
    } finally {
      this.loading.set(false);
    }
  }

  async createEpisode(podcastId: string, data: Partial<Episode>): Promise<Episode> {
    try {
      this.loading.set(true);
      this.error.set(null);

      const { data: episode, error } = await supabase
        .from('episodes')
        .insert({
          podcast_id: podcastId,
          ...data,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      return episode;
    } catch (error) {
      console.error('Failed to create episode:', error);
      this.error.set('Failed to create episode');
      throw error;
    } finally {
      this.loading.set(false);
    }
  }

  async updateEpisode(episodeId: string, updates: EpisodeUpdate): Promise<void> {
    try {
      this.loading.set(true);
      this.error.set(null);

      const { error } = await supabase
        .from('episodes')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', episodeId);

      if (error) throw error;
    } catch (error) {
      console.error('Failed to update episode:', error);
      this.error.set('Failed to update episode');
      throw error;
    } finally {
      this.loading.set(false);
    }
  }

  async deleteEpisode(episodeId: string): Promise<void> {
    try {
      this.loading.set(true);
      this.error.set(null);

      const { error } = await supabase
        .from('episodes')
        .delete()
        .eq('id', episodeId);

      if (error) throw error;
    } catch (error) {
      console.error('Failed to delete episode:', error);
      this.error.set('Failed to delete episode');
      throw error;
    } finally {
      this.loading.set(false);
    }
  }

  // Chapters and Transcripts
  async updateChapters(episodeId: string, chapters: Chapter[]): Promise<void> {
    try {
      this.loading.set(true);
      this.error.set(null);

      const { error } = await supabase
        .from('episodes')
        .update({
          chapters,
          updated_at: new Date().toISOString()
        })
        .eq('id', episodeId);

      if (error) throw error;
    } catch (error) {
      console.error('Failed to update chapters:', error);
      this.error.set('Failed to update chapters');
      throw error;
    } finally {
      this.loading.set(false);
    }
  }

  async updateTranscript(episodeId: string, transcript: Transcript): Promise<void> {
    try {
      this.loading.set(true);
      this.error.set(null);

      const { error } = await supabase
        .from('episodes')
        .update({
          transcript,
          updated_at: new Date().toISOString()
        })
        .eq('id', episodeId);

      if (error) throw error;
    } catch (error) {
      console.error('Failed to update transcript:', error);
      this.error.set('Failed to update transcript');
      throw error;
    } finally {
      this.loading.set(false);
    }
  }

  // Analytics
  async trackListen(episodeId: string, data: {
    duration: number;
    completed: boolean;
    timestamp: number;
  }): Promise<void> {
    try {
      const { error } = await supabase
        .from('episode_analytics')
        .insert({
          episode_id: episodeId,
          ...data,
          created_at: new Date().toISOString()
        });

      if (error) throw error;
    } catch (error) {
      console.error('Failed to track listen:', error);
    }
  }

  // Store accessors
  getPodcast(podcastId: string): Podcast | null {
    let podcast: Podcast | null = null;
    this.podcasts.subscribe(podcasts => {
      podcast = podcasts[podcastId] || null;
    })();
    return podcast;
  }

  getCreatorPodcasts(): Podcast[] {
    let creatorPodcasts: Podcast[] = [];
    this.podcasts.subscribe(podcasts => {
      creatorPodcasts = Object.values(podcasts);
    })();
    return creatorPodcasts;
  }

  getPodcastEpisodes(podcastId: string): Episode[] {
    let podcastEpisodes: Episode[] = [];
    this.episodes.subscribe(episodes => {
      podcastEpisodes = episodes[podcastId] || [];
    })();
    return podcastEpisodes;
  }

  getCurrentEpisode(): Episode | null {
    let current: Episode | null = null;
    this.currentEpisode.subscribe(episode => {
      current = episode;
    })();
    return current;
  }

  setCurrentEpisode(episode: Episode | null): void {
    this.currentEpisode.set(episode);
  }

  isLoading() {
    return this.loading;
  }

  getError() {
    return this.error;
  }

  // Derived stores
  podcastCount = derived(this.podcasts, podcasts => Object.keys(podcasts).length);
  
  episodeCount = derived(this.episodes, episodes => 
    Object.values(episodes).reduce((total, podcastEpisodes) => total + podcastEpisodes.length, 0)
  );

  totalListens = derived(this.podcasts, podcasts =>
    Object.values(podcasts).reduce((total, podcast) => total + podcast.stats.totalListens, 0)
  );

  cleanup() {
    if (this.realtimeSubscription) {
      this.realtimeSubscription.unsubscribe();
    }
  }
}

export const podcastService = PodcastService.getInstance(); 