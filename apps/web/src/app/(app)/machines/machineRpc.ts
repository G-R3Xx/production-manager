"use client";

import type { MachineTrace } from "./machineTiming";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export type MachineRpcValues = {
  name: string;
  machineType: string;
  maxWidthMm: string;
  speedValue: string;
  speedUom: string;
  hourlyCost: string;
  setupMinutes: string;
  inkCostPerSqm: string;
  colourImpressionCost: string;
  monoImpressionCost: string;
  maxStackSheets: string;
};

export function machineValuesFromFormData(formData: FormData): MachineRpcValues {
  const value = (key: string) => String(formData.get(key) ?? "").trim();
  return {
    name: value("name"),
    machineType: value("machineType") || "other",
    maxWidthMm: value("maxWidthMm"),
    speedValue: value("speedValue") || "0",
    speedUom: value("speedUom") || "sqm_per_hour",
    hourlyCost: value("hourlyCost") || "0",
    setupMinutes: value("setupMinutes") || "0",
    inkCostPerSqm: value("inkCostPerSqm") || "0",
    colourImpressionCost: value("colourImpressionCost") || "0",
    monoImpressionCost: value("monoImpressionCost") || "0",
    maxStackSheets: value("maxStackSheets") || "0",
  };
}

export async function updateMachineRpc(tenantId: string, machineId: string, values: MachineRpcValues, trace?: MachineTrace) {
  const started = performance.now();
  trace?.mark("rpcStarted");
  const supabase = getSupabaseBrowserClient();
  trace?.mark("clientReady");
  const { data, error } = await supabase.rpc("pm_update_machine", {
    p_tenant_id: tenantId,
    p_machine_id: machineId,
    p_values: values,
  });
  trace?.mark("rpcResolved");
  trace?.detail("rpcDurationMs", performance.now() - started);
  trace?.detail("database", data?._timing ?? null);
  if (error) throw new Error(error.message);
  return data;
}

export async function createMachineRpc(tenantId: string, values: MachineRpcValues, trace?: MachineTrace) {
  const started = performance.now();
  trace?.mark("rpcStarted");
  const supabase = getSupabaseBrowserClient();
  trace?.mark("clientReady");
  const { data, error } = await supabase.rpc("pm_create_machine", {
    p_tenant_id: tenantId,
    p_values: values,
  });
  trace?.mark("rpcResolved");
  trace?.detail("rpcDurationMs", performance.now() - started);
  trace?.detail("database", data?._timing ?? null);
  if (error) throw new Error(error.message);
  return data;
}

export async function duplicateMachineRpc(tenantId: string, machineId: string, trace?: MachineTrace) {
  const started = performance.now();
  trace?.mark("rpcStarted");
  const supabase = getSupabaseBrowserClient();
  trace?.mark("clientReady");
  const { data, error } = await supabase.rpc("pm_duplicate_machine", {
    p_tenant_id: tenantId,
    p_machine_id: machineId,
  });
  trace?.mark("rpcResolved");
  trace?.detail("rpcDurationMs", performance.now() - started);
  trace?.detail("database", data?._timing ?? null);
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteMachineRpc(tenantId: string, machineId: string, trace?: MachineTrace) {
  const started = performance.now();
  trace?.mark("rpcStarted");
  const supabase = getSupabaseBrowserClient();
  trace?.mark("clientReady");
  const { data, error } = await supabase.rpc("pm_delete_machine", {
    p_tenant_id: tenantId,
    p_machine_id: machineId,
  });
  trace?.mark("rpcResolved");
  trace?.detail("rpcDurationMs", performance.now() - started);
  trace?.detail("database", data?._timing ?? null);
  if (error) throw new Error(error.message);
  return data;
}
