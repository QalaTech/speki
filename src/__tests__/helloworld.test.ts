import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'

const HELLOWORLD_PATH = path.join(process.cwd(), 'helloworld.md')
const EXPECTED_CONTENT = 'hello world\n'

describe('helloworld.md file', () => {
  describe('File_Existence_Check_Returns_True', () => {
    it('should exist at repository root', () => {
      expect(fs.existsSync(HELLOWORLD_PATH)).toBe(true)
    })
  })

  describe('Content_Verification_Matches_Exact_String', () => {
    it('should contain exactly "hello world" with trailing newline', () => {
      const content = fs.readFileSync(HELLOWORLD_PATH, 'utf-8')
      expect(content).toBe(EXPECTED_CONTENT)
    })

    it('should match grep pattern for exact line match', () => {
      const content = fs.readFileSync(HELLOWORLD_PATH, 'utf-8')
      const lines = content.split('\n')
      expect(lines[0]).toBe('hello world')
      expect(lines.length).toBe(2) // 'hello world' + empty string from split
    })
  })

  describe('Idempotency_Second_Write_No_Errors', () => {
    it('should handle multiple writes without errors', () => {
      const testContent = 'hello world\n'
      const operation = () => {
        fs.writeFileSync(HELLOWORLD_PATH, testContent, 'utf-8')
      }
      expect(operation).not.toThrow()
      const content = fs.readFileSync(HELLOWORLD_PATH, 'utf-8')
      expect(content).toBe(testContent)
    })
  })
})
