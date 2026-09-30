"use client"

import { useCallback, useEffect, useState } from "react"

import {
  createBrowserSupabase,
  isSupabaseConfigured,
  mapSupply,
  mapUsageLog,
  type DbSupply,
  type DbUsageLog,
} from "@/lib/supabase"
import type { Supply, UsageLogEntry } from "@/lib/types"

type LiveState<T> = {
  data: T
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useLiveSupplies(): LiveState<Supply[]> {
  const [data, setData] = useState<Supply[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setError("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY).")
      setLoading(false)
      return
    }
    try {
      const client = createBrowserSupabase()
      const { data: rows, error: queryError } = await client
        .from("supplies")
        .select("*")
        .order("name")
      if (queryError) throw queryError
      setData((rows as DbSupply[]).map(mapSupply))
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load supplies")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    if (!isSupabaseConfigured()) return

    const client = createBrowserSupabase()
    const channel = client
      .channel("supplies-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "supplies" },
        () => {
          void refresh()
        },
      )
      .subscribe()

    return () => {
      void client.removeChannel(channel)
    }
  }, [refresh])

  return { data, loading, error, refresh }
}

export function useLiveUsageLog(): LiveState<UsageLogEntry[]> {
  const [data, setData] = useState<UsageLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setError("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY).")
      setLoading(false)
      return
    }
    try {
      const client = createBrowserSupabase()
      const { data: rows, error: queryError } = await client
        .from("usage_log")
        .select("*")
        .order("recorded_at", { ascending: false })
      if (queryError) throw queryError
      setData((rows as DbUsageLog[]).map(mapUsageLog))
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load usage log")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    if (!isSupabaseConfigured()) return

    const client = createBrowserSupabase()
    const channel = client
      .channel("usage-log-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "usage_log" },
        () => {
          void refresh()
        },
      )
      .subscribe()

    return () => {
      void client.removeChannel(channel)
    }
  }, [refresh])

  return { data, loading, error, refresh }
}
