/** The Claude model every agent uses, from ANTHROPIC_MODEL. */
export const CHAT_MODEL = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
