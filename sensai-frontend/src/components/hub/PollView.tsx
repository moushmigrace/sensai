"use client";

import { useState } from "react";
import { BarChart2, CheckCircle2, Users } from "lucide-react";
import { castPollVote } from "@/lib/hub-api";
import type { PollResult, PollOption } from "@/types/hub";

interface PollViewProps {
    threadId: number;
    userId: number;
    initialResult: PollResult;
}

export default function PollView({ threadId, userId, initialResult }: PollViewProps) {
    const [result, setResult] = useState<PollResult>(initialResult);
    const [voting, setVoting] = useState(false);
    const [voteError, setVoteError] = useState<string | null>(null);

    const handleVote = async (option: PollOption) => {
        if (result.user_voted || voting) return;
        setVoting(true);
        setVoteError(null);
        try {
            const updated = await castPollVote(threadId, userId, option.id);
            setResult(updated);
        } catch (err) {
            if (err instanceof Error && err.message === "already_voted") {
                setVoteError("You have already voted on this poll.");
            } else {
                setVoteError("Failed to cast vote. Please try again.");
            }
        } finally {
            setVoting(false);
        }
    };

    const { total_votes, user_voted, user_option_id, options } = result;

    return (
        <div className="mt-3 space-y-3">
            {/* Header */}
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <BarChart2 size={13} />
                <span>Poll</span>
                <span>·</span>
                <Users size={12} />
                <span>
                    {total_votes} {total_votes === 1 ? "vote" : "votes"}
                </span>
                {user_voted && (
                    <>
                        <span>·</span>
                        <span className="text-green-600 dark:text-green-400 font-medium flex items-center gap-0.5">
                            <CheckCircle2 size={11} />
                            Voted
                        </span>
                    </>
                )}
            </div>

            {/* Options */}
            <div className="space-y-2">
                {options.map((option) => {
                    const pct =
                        total_votes > 0
                            ? Math.round((option.vote_count / total_votes) * 100)
                            : 0;
                    const isUserChoice = option.id === user_option_id;

                    if (user_voted) {
                        // Results view — progress bars
                        return (
                            <div key={option.id} className="space-y-1">
                                <div className="flex items-center justify-between text-sm">
                                    <span
                                        className={`font-medium ${
                                            isUserChoice
                                                ? "text-indigo-600 dark:text-indigo-400"
                                                : "text-gray-800 dark:text-gray-200"
                                        }`}
                                    >
                                        {isUserChoice && (
                                            <CheckCircle2
                                                size={13}
                                                className="inline mr-1 mb-0.5"
                                            />
                                        )}
                                        {option.text}
                                    </span>
                                    <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums ml-2 shrink-0">
                                        {pct}% · {option.vote_count}
                                    </span>
                                </div>
                                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${
                                            isUserChoice
                                                ? "bg-indigo-500"
                                                : "bg-gray-400 dark:bg-gray-500"
                                        }`}
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                            </div>
                        );
                    }

                    // Voting view — clickable buttons
                    return (
                        <button
                            key={option.id}
                            type="button"
                            onClick={() => handleVote(option)}
                            disabled={voting}
                            className="w-full text-left px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 text-sm hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                        >
                            {option.text}
                        </button>
                    );
                })}
            </div>

            {voteError && (
                <p className="text-xs text-red-600 dark:text-red-400">{voteError}</p>
            )}

            {!user_voted && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                    Select an option to cast your vote. Results will be shown after voting.
                </p>
            )}
        </div>
    );
}
