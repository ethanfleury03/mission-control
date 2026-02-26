import { create } from 'zustand';
import { XYPosition } from '@xyflow/react';
import { ProfileData } from '../../src/components/team/types';

interface OrgChartState {
  // UI state only - React Flow manages nodes/edges
  selectedNodeId: string | null;
  detailPanelOpen: boolean;
  profileData: ProfileData | null;
  loadingProfile: boolean;

  // Actions
  selectNode: (id: string | null) => void;
  setDetailPanelOpen: (open: boolean) => void;
  setProfileData: (data: ProfileData | null) => void;
  setLoadingProfile: (loading: boolean) => void;
}

export const useOrgChartStore = create<OrgChartState>((set) => ({
  selectedNodeId: null,
  detailPanelOpen: false,
  profileData: null,
  loadingProfile: false,

  selectNode: (id) => {
    set({ selectedNodeId: id, detailPanelOpen: id !== null });
  },

  setDetailPanelOpen: (open) => {
    set({ detailPanelOpen: open });
    if (!open) {
      set({ selectedNodeId: null, profileData: null });
    }
  },

  setProfileData: (data) => set({ profileData: data }),
  setLoadingProfile: (loading) => set({ loadingProfile: loading }),
}));
