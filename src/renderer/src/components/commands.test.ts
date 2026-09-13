import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterCommands, shortcutCommand, languageName } from './commands.ts'

const event = (key: string, shiftKey = false): Parameters<typeof shortcutCommand>[0] => ({
  key,
  shiftKey,
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  isComposing: false
})
test('search shortcuts coexist with save, panels, and native editor find', () => {
  assert.equal(shortcutCommand(event('p')), 'search.files')
  assert.equal(shortcutCommand(event('P', true)), 'search.commands')
  assert.equal(shortcutCommand(event('F', true)), 'search.text')
  assert.equal(shortcutCommand(event('f')), undefined)
  assert.equal(shortcutCommand(event('s')), 'file.save')
  assert.equal(shortcutCommand(event('b')), 'view.sidebar')
  assert.equal(shortcutCommand(event('j')), 'view.terminal')
  assert.equal(shortcutCommand({ ...event('p'), ctrlKey: false, metaKey: true }), 'search.files')
  assert.equal(shortcutCommand({ ...event('p'), isComposing: true }), undefined)
  assert.equal(shortcutCommand({ ...event('p'), altKey: true }), undefined)
})
test('commands search labels and aliases without executing any action', () => {
  let executed = false
  const commands = [
    {
      id: 'text',
      label: 'Find in Project',
      keywords: 'find all search text',
      enabled: false,
      run: () => {
        executed = true
      }
    }
  ]
  assert.equal(filterCommands(commands, 'FIND all')[0].id, 'text')
  assert.equal(filterCommands(commands, 'missing').length, 0)
  assert.equal(executed, false)
  assert.equal(filterCommands(commands, '')[0].enabled, false)
})
test('language reporting covers source and plain text files', () => {
  assert.equal(languageName('/project/App.tsx'), 'TypeScript JSX')
  assert.equal(languageName('/project/file.PY'), 'Python')
  assert.equal(languageName('/project/LICENSE'), 'Plain Text')
})
