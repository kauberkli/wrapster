import type { Models } from 'appwrite'

import { databases, ID, Query } from './config'

const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID

export type Document = Models.Document

export { Query }

export const databaseService = {
  async createDocument<T extends Document>(
    collectionId: string,
    data: Omit<T, keyof Document>,
    documentId?: string,
    permissions?: string[]
  ) {
    return databases.createDocument<T>(
      DATABASE_ID,
      collectionId,
      documentId ?? ID.unique(),
      data as Parameters<typeof databases.createDocument<T>>[3],
      permissions
    )
  },

  async getDocument<T extends Document>(
    collectionId: string,
    documentId: string
  ) {
    return databases.getDocument<T>(DATABASE_ID, collectionId, documentId)
  },

  async listDocuments<T extends Document>(
    collectionId: string,
    queries?: string[]
  ) {
    return databases.listDocuments<T>(DATABASE_ID, collectionId, queries)
  },

  async updateDocument<T extends Document>(
    collectionId: string,
    documentId: string,
    data: Partial<Omit<T, keyof Document>>,
    permissions?: string[]
  ) {
    return databases.updateDocument<T>(
      DATABASE_ID,
      collectionId,
      documentId,
      data as Parameters<typeof databases.updateDocument<T>>[3],
      permissions
    )
  },

  async deleteDocument(collectionId: string, documentId: string) {
    return databases.deleteDocument(DATABASE_ID, collectionId, documentId)
  },
}
