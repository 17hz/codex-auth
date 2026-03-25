#!/usr/bin/env bun

import fs from 'node:fs/promises'
import path from 'node:path'
import { homedir } from 'node:os'
import { select } from '@inquirer/prompts'
import stringWidth from 'string-width'
import dayjs from 'dayjs'
import pc from 'picocolors'
import ora from 'ora'

interface AuthFile {
  auth_mode: string
  OPENAI_API_KEY: string
  tokens: {
    id_token: string
    access_token: string
    refresh_token: string
    account_id: string
  }
  last_refresh: string
}

interface WeeklyWindow {
  limit_window_seconds: number
  reset_after_seconds: number
  reset_at: number
  used_percent: number
}

interface RegistryFile {
  active_account_id: string
}

interface AccountInfo {
  account_id: string
  email: string
  isActive: boolean
  plan: string
  auth_file: string
  weekly_window: WeeklyWindow
}

const CODEX_HOME = path.join(homedir(), '.codex')
const AUTH_FILE = path.join(CODEX_HOME, 'auth.json')
const ACCOUNTS_DIR = path.join(CODEX_HOME, 'accounts')
const REGISTRY_FILE = path.join(ACCOUNTS_DIR, 'registry.json')

async function fetchUsage(accessToken: string, accountId: string) {
  const response = await fetch('https://chatgpt.com/backend-api/wham/usage', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'ChatGPT-Account-Id': accountId,
      'User-Agent': 'codex-auth',
      'Accept-Encoding': 'identity',
    },
  })

  const body = (await response.json()) as { rate_limit: { primary_window: WeeklyWindow } }

  return body
}

function padEndVisually(str: string, targetWidth: number): string {
  const currentWidth = stringWidth(str)
  const padding = Math.max(0, targetWidth - currentWidth)
  return str + ' '.repeat(padding)
}

function formatUsage(usage: WeeklyWindow): string {
  const percent = `${100 - usage.used_percent}%`.padStart(4)
  const resetTime = dayjs.unix(usage.reset_at).format('HH:mm on D MMM')
  return `${percent} (${resetTime})`
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true })
}

async function getActiveAccountId(): Promise<string | null> {
  try {
    if (!fs.exists(REGISTRY_FILE)) {
      return null
    }
    const content = await fs.readFile(REGISTRY_FILE, 'utf-8')
    const registry = JSON.parse(content) as RegistryFile
    return registry.active_account_id || null
  } catch {
    return null
  }
}

async function setActiveAccountId(accountId: string): Promise<void> {
  const registry: RegistryFile = { active_account_id: accountId }
  await fs.writeFile(REGISTRY_FILE, JSON.stringify(registry, null, 2))
}

async function parseAuthFile(path: string) {
  const content = await fs.readFile(path, 'utf-8')
  return JSON.parse(content) as AuthFile
}

async function switchAccount(accountId: string, accounts: AccountInfo[]) {
  const currentAuthContent = await parseAuthFile(AUTH_FILE)
  const currentAccountId = currentAuthContent.tokens.account_id

  const currentAccount = accounts.find((a) => a.account_id === currentAccountId)

  if (currentAccount) {
    await fs.writeFile(currentAccount.auth_file, JSON.stringify(currentAuthContent, null, 2))
  }

  const targetAccount = accounts.find((a) => a.account_id === accountId)

  if (!targetAccount) {
    throw new Error(`Account ID not found: ${accountId}`)
  }

  const targetContent = await parseAuthFile(targetAccount.auth_file)
  await fs.writeFile(AUTH_FILE, JSON.stringify(targetContent, null, 2))

  await setActiveAccountId(accountId)
}

async function listAccounts() {
  await ensureDir(ACCOUNTS_DIR)
  const activeAccountId = await getActiveAccountId()
  const files = await fs.readdir(ACCOUNTS_DIR)
  const authFiles = files.filter((f) => f.endsWith('.auth.json'))

  if (authFiles.length === 0) {
    return []
  }

  const accounts: AccountInfo[] = []

  for (const file of authFiles) {
    const email = file.replace('.auth.json', '').replace(/_([^_]+)_([^_]+)$/, '@$1.$2')
    const filePath = path.join(ACCOUNTS_DIR, file)

    try {
      const authData = await parseAuthFile(filePath)

      const usage = await fetchUsage(authData.tokens.access_token, authData.tokens.account_id)

      accounts.push({
        account_id: authData.tokens.account_id,
        email,
        isActive: authData.tokens.account_id === activeAccountId,
        plan: 'free',
        auth_file: filePath,
        weekly_window: usage.rate_limit.primary_window,
      })
    } catch (error) {
      console.warn(`Failed to read file ${file}: ${error}`)
    }
  }

  return accounts
}

export async function interactiveSwitch() {
  const spinner = ora('Fetching account usage...').start()

  const accounts = await listAccounts()

  spinner.stop()

  if (accounts.length === 0) {
    console.log('\nNo available accounts')
    return
  }

  const choices = accounts.map((account) => {
    const prefix = account.isActive ? '* ' : '  '
    const plan = account.plan || ''
    const usage = formatUsage(account.weekly_window)
    const formattedName = `${prefix}${padEndVisually(account.email, 20)} ${padEndVisually(plan, 7)} ${usage}`

    return {
      name: formattedName,
      value: account.account_id,
      description: `ID: ${account.account_id}`,
      disabled: false,
    }
  })

  try {
    const selectedAccountId = await select({
      message: pc.dim(
        `  ${padEndVisually('ACCOUNT', 20)} ${padEndVisually('PLAN', 7)} WEEKLY USAGE\n  ${'-'.repeat(54)}`,
      ),
      choices: choices,
      default: accounts.find((a) => a.isActive)?.account_id,
    })

    await switchAccount(selectedAccountId as string, accounts)

    console.log(`\nSwitched to account ID: ${selectedAccountId}`)
  } catch (error) {
    // User cancelled (Ctrl+C)
  }
}

interactiveSwitch().catch(console.error)
