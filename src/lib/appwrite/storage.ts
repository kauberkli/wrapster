import type { ImageGravity, Models } from 'appwrite'

import { ID, storage } from './config'

const BUCKET_ID = import.meta.env.VITE_APPWRITE_BUCKET_ID

export type File = Models.File

export const storageService = {
  async uploadFile(
    file: globalThis.File,
    fileId?: string,
    permissions?: string[]
  ) {
    return storage.createFile(
      BUCKET_ID,
      fileId ?? ID.unique(),
      file,
      permissions
    )
  },

  async getFile(fileId: string) {
    return storage.getFile(BUCKET_ID, fileId)
  },

  async listFiles(queries?: string[], search?: string) {
    return storage.listFiles(BUCKET_ID, queries, search)
  },

  async deleteFile(fileId: string) {
    return storage.deleteFile(BUCKET_ID, fileId)
  },

  async updateFile(fileId: string, name?: string, permissions?: string[]) {
    return storage.updateFile(BUCKET_ID, fileId, name, permissions)
  },

  getFilePreview(
    fileId: string,
    options?: {
      width?: number
      height?: number
      gravity?: ImageGravity
      quality?: number
    }
  ) {
    return storage.getFilePreview(
      BUCKET_ID,
      fileId,
      options?.width,
      options?.height,
      options?.gravity,
      options?.quality
    )
  },

  getFileDownload(fileId: string) {
    return storage.getFileDownload(BUCKET_ID, fileId)
  },

  getFileView(fileId: string) {
    return storage.getFileView(BUCKET_ID, fileId)
  },
}
