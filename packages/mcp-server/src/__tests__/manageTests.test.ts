import { describe, it, expect, vi } from 'vitest';
import { manageTestsTool } from '../tools/manageTests.js';
import { BridgeClient } from '../bridge/bridgeClient.js';

function createMockBridge(): {
    bridge: BridgeClient;
    written: Array<{ path: string; content: string; description?: string }>;
} {
    const written: Array<{ path: string; content: string; description?: string }> = [];
    const bridge = {
        writeScript: vi.fn(async (path: string, content: string, description?: string) => {
            written.push({ path, content, description });
        }),
        readScript: vi.fn(async (_path: string) => {
            return `return {
    name = "Mock Suite",
    tests = {
        { name = "always passes", fn = function() assert(true) end },
    },
}`;
        }),
        runCode: vi.fn(async (_code: string, _studioId?: string) => {
            return `Some output\n__LUNAIDE_TEST_RESULT__{"name":"Mock Suite","tests":[{"name":"always passes","status":"pass"}],"benchmarks":[],"summary":{"total":1,"passed":1,"failed":0}}__END__\nDone`;
        }),
        searchFiles: vi.fn(async (_query: string, _options?: unknown) => {
            return [{ path: '.lunaide/tests/math.test.luau' }, { path: '.lunaide/tests/utils.test.luau' }];
        }),
    } as unknown as BridgeClient;
    return { bridge, written };
}

describe('manageTestsTool', () => {
    describe('create action', () => {
        it('generates a test file and writes it via bridge', async () => {
            const { bridge, written } = createMockBridge();
            const tool = manageTestsTool(bridge);

            const result = await tool.handler({
                action: 'create',
                name: 'math-utils',
                tests: [
                    { name: 'add works', body: 'assert(1 + 2 == 3, "Expected 3")' },
                    { name: 'sub works', body: 'assert(3 - 1 == 2, "Expected 2")' },
                ],
                benchmarks: [
                    { name: 'add throughput', body: 'local s = 0\nfor i = 1, 1000 do s = s + i end', iterations: 50 },
                ],
            });

            expect(result.isError).toBeUndefined();
            expect(written).toHaveLength(1);
            expect(written[0].path).toBe('.lunaide/tests/math-utils.test.luau');

            const content = written[0].content;
            expect(content).toContain('name = "math-utils"');
            expect(content).toContain('name = "add works"');
            expect(content).toContain('name = "sub works"');
            expect(content).toContain('assert(1 + 2 == 3, "Expected 3")');
            expect(content).toContain('name = "add throughput"');
            expect(content).toContain('iterations = 50');

            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.created).toBe('.lunaide/tests/math-utils.test.luau');
            expect(parsed.tests).toBe(2);
            expect(parsed.benchmarks).toBe(1);
        });

        it('errors when name is missing', async () => {
            const { bridge } = createMockBridge();
            const tool = manageTestsTool(bridge);

            const result = await tool.handler({ action: 'create', tests: [{ name: 't', body: '' }] });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('name is required');
        });

        it('errors when tests array is missing', async () => {
            const { bridge } = createMockBridge();
            const tool = manageTestsTool(bridge);

            const result = await tool.handler({ action: 'create', name: 'foo' });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('tests array is required');
        });

        it('generates file without benchmarks when not provided', async () => {
            const { bridge, written } = createMockBridge();
            const tool = manageTestsTool(bridge);

            await tool.handler({
                action: 'create',
                name: 'simple',
                tests: [{ name: 'test1', body: 'assert(true)' }],
            });

            expect(written[0].content).not.toContain('benchmarks');
        });
    });

    describe('run action', () => {
        it('runs a single named test and parses results', async () => {
            const { bridge } = createMockBridge();
            const tool = manageTestsTool(bridge);

            const result = await tool.handler({ action: 'run', name: 'math' });

            expect(result.isError).toBeUndefined();
            expect(bridge.readScript).toHaveBeenCalledWith('.lunaide/tests/math.test.luau');
            expect(bridge.runCode).toHaveBeenCalledTimes(1);

            // Verify the code sent includes harness + test content
            const codeSent = (bridge.runCode as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
            expect(codeSent).toContain('__runTests');
            expect(codeSent).toContain('Mock Suite');

            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.name).toBe('Mock Suite');
            expect(parsed.summary.passed).toBe(1);
        });

        it('runs all tests when no name provided', async () => {
            const { bridge } = createMockBridge();
            const tool = manageTestsTool(bridge);

            const result = await tool.handler({ action: 'run' });

            expect(bridge.searchFiles).toHaveBeenCalled();
            expect(bridge.readScript).toHaveBeenCalledTimes(2);
            expect(bridge.runCode).toHaveBeenCalledTimes(2);

            const parsed = JSON.parse(result.content[0].text);
            expect(Array.isArray(parsed)).toBe(true);
            expect(parsed).toHaveLength(2);
        });

        it('passes studioId to runCode', async () => {
            const { bridge } = createMockBridge();
            const tool = manageTestsTool(bridge);

            await tool.handler({ action: 'run', name: 'math', studioId: 'studio-42' });

            expect(bridge.runCode).toHaveBeenCalledWith(expect.any(String), 'studio-42');
        });

        it('errors when runner output has no marker', async () => {
            const { bridge } = createMockBridge();
            (bridge.runCode as ReturnType<typeof vi.fn>).mockResolvedValueOnce('no markers here');
            const tool = manageTestsTool(bridge);

            const result = await tool.handler({ action: 'run', name: 'bad' });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('did not produce structured output');
        });

        it('errors when runner output has malformed JSON', async () => {
            const { bridge } = createMockBridge();
            (bridge.runCode as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
                '__LUNAIDE_TEST_RESULT__{not json}__END__'
            );
            const tool = manageTestsTool(bridge);

            const result = await tool.handler({ action: 'run', name: 'bad' });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Failed to parse test result JSON');
        });
    });

    describe('list action', () => {
        it('returns test files from bridge search', async () => {
            const { bridge } = createMockBridge();
            const tool = manageTestsTool(bridge);

            const result = await tool.handler({ action: 'list' });

            expect(result.isError).toBeUndefined();
            expect(bridge.searchFiles).toHaveBeenCalledWith('*.test.luau', { include: '.lunaide/tests/**' });

            const parsed = JSON.parse(result.content[0].text);
            expect(parsed).toHaveLength(2);
            expect(parsed[0].path).toBe('.lunaide/tests/math.test.luau');
        });
    });

    describe('delete action', () => {
        it('writes empty content to delete the file', async () => {
            const { bridge, written } = createMockBridge();
            const tool = manageTestsTool(bridge);

            const result = await tool.handler({ action: 'delete', name: 'old-tests' });

            expect(result.isError).toBeUndefined();
            expect(written).toHaveLength(1);
            expect(written[0].path).toBe('.lunaide/tests/old-tests.test.luau');
            expect(written[0].content).toBe('');

            const parsed = JSON.parse(result.content[0].text);
            expect(parsed.deleted).toBe('.lunaide/tests/old-tests.test.luau');
        });

        it('errors when name is missing', async () => {
            const { bridge } = createMockBridge();
            const tool = manageTestsTool(bridge);

            const result = await tool.handler({ action: 'delete' });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('name is required');
        });
    });

    describe('invalid action', () => {
        it('returns error for unknown action', async () => {
            const { bridge } = createMockBridge();
            const tool = manageTestsTool(bridge);

            const result = await tool.handler({ action: 'explode' as 'run' });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Invalid action');
        });
    });
});
