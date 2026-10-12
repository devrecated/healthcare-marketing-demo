# 02 — Supplies live

## Goal

Prove inventory is live and the demo can be reset cleanly before a scan.

## Surface

- Host: https://healthcare-demo.devrecated.com/inventory  
- Continue from an authenticated laptop session.

## Shot list

1. Navigate to **Supplies** (sidebar).
2. Pan the table: supply names, SKUs, on-hand quantities.
3. Click **Reset data** in the top bar (confirm if prompted) so quantities start from a known seed.
4. Brief hold on the restored table / success toast.

## On-screen copy to capture

- Sidebar “Acme Healthcare”
- Supplies table with on-hand counts

## Do not show

- Empty error states from missing Supabase (fix env before recording).
- Real clinic SKUs or lot numbers outside the synthetic seed.
