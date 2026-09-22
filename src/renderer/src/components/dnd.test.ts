import { test } from 'node:test'
import assert from 'node:assert/strict'
import { droppedOutside } from './dnd.ts'

test('droppedOutside: only an unclaimed drop past the window edge counts', () => {
  ;(globalThis as { window?: unknown }).window = {
    screenX: 100,
    screenY: 50,
    outerWidth: 800,
    outerHeight: 600
  }
  const at = (
    screenX: number,
    screenY: number,
    dropEffect = 'none'
  ): Parameters<typeof droppedOutside>[0] => ({
    dataTransfer: { dropEffect } as DataTransfer,
    screenX,
    screenY
  })
  assert.equal(droppedOutside(at(50, 300)), true)
  assert.equal(droppedOutside(at(400, 700)), true)
  assert.equal(droppedOutside(at(400, 300)), false)
  assert.equal(droppedOutside(at(50, 300, 'move')), false)
})
