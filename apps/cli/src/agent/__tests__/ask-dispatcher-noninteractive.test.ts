// MaxQ: in non-interactive mode, approvals the extension's auto-approval
// settings did not cover are refused (fail closed), and approvals it already
// answered are left alone.
import type { ClineMessage } from "@roo-code/types"

import { AskDispatcher } from "../ask-dispatcher.js"
import type { OutputManager } from "../output-manager.js"
import type { PromptManager } from "../prompt-manager.js"

function makeDispatcher(disabled = false) {
	const sendMessage = vi.fn()
	const outputManager = { output: vi.fn(), markDisplayed: vi.fn() } as unknown as OutputManager
	const promptManager = { promptForYesNo: vi.fn() } as unknown as PromptManager
	const dispatcher = new AskDispatcher({ outputManager, promptManager, sendMessage, nonInteractive: true, disabled })
	return { dispatcher, sendMessage, promptManager }
}

let ts = 1000
const ask = (fields: Partial<ClineMessage>): ClineMessage =>
	({ type: "ask", ts: ts++, text: "", partial: false, ...fields }) as ClineMessage

describe("AskDispatcher (non-interactive, fail closed)", () => {
	it("leaves an auto-approved tool ask alone", async () => {
		const { dispatcher, sendMessage } = makeDispatcher()
		const result = await dispatcher.handleAsk(
			ask({
				ask: "tool",
				text: '{"tool":"readFile","path":"index.html"}',
				isAnswered: true,
				autoApprovalDecision: "approve",
			}),
		)
		expect(result).toEqual({ handled: true })
		expect(sendMessage).not.toHaveBeenCalled()
	})

	it.each([
		["tool", '{"tool":"readFile","path":"../../secret.txt","isOutsideWorkspace":true}'],
		["tool", '{"tool":"editedExistingFile","path":".roo/mcp.json","isProtected":true}'],
		["command", "cat /proc/self/environ"],
		["use_mcp_server", '{"serverName":"unknown","toolName":"x"}'],
	])("refuses an unapproved %s ask: %s", async (kind, text) => {
		const { dispatcher, sendMessage, promptManager } = makeDispatcher()
		const result = await dispatcher.handleAsk(ask({ ask: kind as ClineMessage["ask"], text }))
		expect(result).toEqual({ handled: true, response: "noButtonClicked" })
		expect(sendMessage).toHaveBeenCalledWith({ type: "askResponse", askResponse: "noButtonClicked" })
		expect(promptManager.promptForYesNo).not.toHaveBeenCalled()
	})

	it("still refuses when output is disabled (JSON / stdin-stream mode)", async () => {
		const { dispatcher, sendMessage } = makeDispatcher(true)
		const result = await dispatcher.handleAsk(ask({ ask: "command", text: "echo hello > ran.txt" }))
		expect(result).toEqual({ handled: true, response: "noButtonClicked" })
		expect(sendMessage).toHaveBeenCalledWith({ type: "askResponse", askResponse: "noButtonClicked" })
	})

	it("leaves followup questions to the client when output is disabled", async () => {
		const { dispatcher, sendMessage } = makeDispatcher(true)
		const result = await dispatcher.handleAsk(ask({ ask: "followup", text: '{"question":"Which layout?"}' }))
		expect(result).toEqual({ handled: false })
		expect(sendMessage).not.toHaveBeenCalled()
	})

	it("does not answer a partial ask", async () => {
		const { dispatcher, sendMessage } = makeDispatcher()
		const result = await dispatcher.handleAsk(ask({ ask: "tool", text: "{}", partial: true }))
		expect(result).toEqual({ handled: false })
		expect(sendMessage).not.toHaveBeenCalled()
	})
})
