/**
 * Tests for CRM tool description quality on consolidated tools.
 * @module lib/runner/tools/crm/__tests__/descriptions.test
 */
import { describe, expect, it } from "vitest";

import { createCreateRecordTool } from "../create-record";
import { createUpdateRecordTool } from "../update-record";
import { createDeleteRecordsTool } from "../delete-records";
import { createLinkRecordsTool } from "../link-records";
import { createInteractionTools } from "../interactions";
import { createTaskTools } from "../tasks";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const { client } = createMockSupabase();

describe("P0: data modification warnings on all write tools", () => {
  const { create_record } = createCreateRecordTool(client, CLIENT_ID);
  const { update_record } = createUpdateRecordTool(client, CLIENT_ID);
  const { link_records } = createLinkRecordsTool(client, CLIENT_ID);
  const { create_interaction } = createInteractionTools(client, CLIENT_ID);
  const { create_task, update_task } = createTaskTools(client, CLIENT_ID);

  it.each([
    ["create_record", create_record],
    ["update_record", update_record],
    ["link_records", link_records],
    ["create_interaction", create_interaction],
    ["create_task", create_task],
    ["update_task", update_task],
  ])("%s has data modification warning", (_name, toolObj) => {
    expect(toolObj.description).toContain("Data Modification Warning");
  });
});

describe("P1-c: consolidated search/create descriptions include usage guidance", () => {
  const { create_record } = createCreateRecordTool(client, CLIENT_ID);

  it("create_record mentions duplicate detection", () => {
    expect(create_record.description).toContain("duplicate detection");
  });

  it("create_record mentions force_create override", () => {
    expect(create_record.description).toContain("force_create");
  });
});

describe("P1-f: update tools mention partial-update behavior", () => {
  const { update_record } = createUpdateRecordTool(client, CLIENT_ID);
  const { update_task } = createTaskTools(client, CLIENT_ID);

  it.each([
    ["update_record", update_record],
    ["update_task", update_task],
  ])("%s mentions partial updates", (_name, toolObj) => {
    expect(toolObj.description).toContain("Only provided fields are");
  });
});
