"use client";

import Link from "next/link";
import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import type { Module } from "@/types/course";
import { listCourseHubs } from "@/lib/hub-api";

interface CourseHubButtonProps {
    schoolSegment: string;
    courseId: string;
    /** If API has no rows yet, build links from modules (milestone routes). */
    modulesFallback?: Module[];
}

/**
 * CORRECT_HUBS_IMPLEMENTATION: standalone **HUB** control outside module cards.
 * Dropdown lists each module hub (from `hubs` API), navigates to `/courses/.../hubs/[hubId]`.
 */
export default function CourseHubButton({
    schoolSegment,
    courseId,
    modulesFallback = [],
}: CourseHubButtonProps) {
    const [open, setOpen] = useState(false);
    const [hubs, setHubs] = useState<
        { id: number; milestone_id: number; milestone_name: string }[]
    >([]);
    const [loaded, setLoaded] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const cid = parseInt(courseId, 10);

    const loadHubs = useCallback(async () => {
        if (Number.isNaN(cid)) return;
        try {
            const data = await listCourseHubs(cid);
            setHubs(data);
        } catch {
            setHubs([]);
        } finally {
            setLoaded(true);
        }
    }, [cid]);

    useEffect(() => {
        loadHubs();
    }, [loadHubs]);

    useEffect(() => {
        const close = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, []);

    const base = `/school/${schoolSegment}/courses/${courseId}`;

    const entries: { key: string; label: string; href: string }[] =
        hubs.length > 0
            ? hubs.map((h) => ({
                  key: `hub-${h.id}`,
                  label: `${h.milestone_name} Hub`,
                  href: `${base}/hubs/${h.id}`,
              }))
            : loaded && modulesFallback.length > 0
              ? modulesFallback.map((m) => ({
                    key: `mod-${m.id}`,
                    label: m.title?.trim() ? `${m.title} Hub` : `Module ${m.position} Hub`,
                    href: `${base}/hub/${m.id}`,
                }))
              : [];

    if (!courseId) return null;

    return (
        <div className="relative mb-8" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl border-2 border-indigo-500/80 bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-semibold tracking-wide shadow-lg shadow-indigo-900/20 transition-colors"
                aria-expanded={open}
                aria-haspopup="listbox"
            >
                HUB
                <ChevronDown
                    size={22}
                    className={`transition-transform ${open ? "rotate-180" : ""}`}
                />
            </button>
            {open && (
                <div
                    className="absolute left-0 top-full mt-3 min-w-[260px] max-h-[min(70vh,400px)] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl z-40 py-2"
                    role="listbox"
                >
                    {entries.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                            No module hubs yet. Create a module in the course to open a hub.
                        </p>
                    ) : (
                        entries.map((e) => (
                            <Link
                                key={e.key}
                                href={e.href}
                                className="block px-4 py-3 text-sm text-gray-900 dark:text-gray-100 hover:bg-indigo-50 dark:hover:bg-gray-800 transition-colors"
                                onClick={() => setOpen(false)}
                            >
                                {e.label}
                            </Link>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
