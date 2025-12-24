import type { Models } from 'appwrite'

import { account, ID } from './config'

export type User = Models.User<Models.Preferences>

export const authService = {
  async createAccount(email: string, password: string, name?: string) {
    const user = await account.create(ID.unique(), email, password, name)
    await this.login(email, password)
    return user
  },

  async login(email: string, password: string) {
    return account.createEmailPasswordSession(email, password)
  },

  async logout() {
    return account.deleteSession('current')
  },

  async getCurrentUser(): Promise<User | null> {
    try {
      return await account.get()
    } catch {
      return null
    }
  },

  async updateName(name: string) {
    return account.updateName(name)
  },

  async updateEmail(email: string, password: string) {
    return account.updateEmail(email, password)
  },

  async updatePassword(password: string, oldPassword: string) {
    return account.updatePassword(password, oldPassword)
  },

  async createPasswordRecovery(email: string, url: string) {
    return account.createRecovery(email, url)
  },

  async confirmPasswordRecovery(
    userId: string,
    secret: string,
    password: string
  ) {
    return account.updateRecovery(userId, secret, password)
  },

  async createEmailVerification(url: string) {
    return account.createVerification(url)
  },

  async confirmEmailVerification(userId: string, secret: string) {
    return account.updateVerification(userId, secret)
  },
}
