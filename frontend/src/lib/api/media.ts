// ============================================================
// Média — upload d'images produits (stockage backend persistant)
// ============================================================
import { api } from "./client";
import type { MediaAsset } from "@/lib/types";

export const mediaApi = {
  upload: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.upload<MediaAsset>("/media/upload", fd);
  },
  remove: (mediaId: string) => api.delete<{ message: string }>(`/media/${mediaId}`),
};
