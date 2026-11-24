// Register jsdom before react-dom loads, so React uses native input events.
import "global-jsdom/register";
import assert from "node:assert";
import { afterEach, describe, test } from "node:test";
import {
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react";
import React from "react";
import SchemaPropertyEditor from "../../src/components/SchemaEditor/SchemaPropertyEditor.tsx";
import TypeEditor from "../../src/components/SchemaEditor/TypeEditor.tsx";
import type { ObjectJsonSchema } from "../../src/types/jsonSchema.ts";
import {
  canBeNullable,
  getBaseType,
  getEditorType,
  isNullableSchema,
  setNullable,
} from "../../src/types/jsonSchema.ts";

const body = () => within(document.body);

const employeeType: ObjectJsonSchema = {
  type: "string",
  enum: ["monthly", "bimonthly"],
  description: "Employee Type",
};

describe("nullable helpers", () => {
  test("setNullable(true) adds null to type and enum", () => {
    assert.deepStrictEqual(setNullable(employeeType, true), {
      type: ["string", "null"],
      enum: ["monthly", "bimonthly", null],
      description: "Employee Type",
    });
  });

  test("setNullable(false) restores the original schema", () => {
    assert.deepStrictEqual(
      setNullable(setNullable(employeeType, true), false),
      employeeType,
    );
  });

  test("setNullable(true) is idempotent and does not add enum when absent", () => {
    const once = setNullable({ type: "integer", minimum: 1 }, true);
    assert.deepStrictEqual(once, { type: ["integer", "null"], minimum: 1 });
    assert.deepStrictEqual(setNullable(once, true), once);
  });

  test("isNullableSchema", () => {
    assert.strictEqual(isNullableSchema(employeeType), false);
    assert.strictEqual(isNullableSchema({ type: ["string", "null"] }), true);
    assert.strictEqual(isNullableSchema({ type: ["null", "string"] }), true);
    assert.strictEqual(isNullableSchema({ type: ["null"] }), false);
    assert.strictEqual(isNullableSchema(true), false);
  });

  test("base type ignores null", () => {
    assert.strictEqual(getBaseType(["null", "number"]), "number");
    assert.strictEqual(getBaseType("boolean"), "boolean");
    assert.strictEqual(getBaseType(undefined), "object");
    assert.strictEqual(getEditorType({ type: ["string", "null"] }), "string");
  });

  test("combinators, null type and boolean schemas cannot be nullable", () => {
    assert.strictEqual(canBeNullable({ anyOf: [{ type: "string" }] }), false);
    assert.strictEqual(canBeNullable({ type: "null" }), false);
    assert.strictEqual(canBeNullable(true), false);
    assert.strictEqual(canBeNullable({ type: "array" }), true);
    const anyOf = { anyOf: [{ type: "string" as const }] };
    assert.deepStrictEqual(setNullable(anyOf, true), anyOf);
  });
});

describe("Nullable toggle", () => {
  afterEach(cleanup);

  const renderProperty = (
    schema: ObjectJsonSchema,
    onSchemaChange: (s: ObjectJsonSchema) => void,
    readOnly = false,
  ) =>
    render(
      React.createElement(SchemaPropertyEditor, {
        name: "employee_type",
        schema,
        required: false,
        readOnly,
        onDelete: () => {},
        onNameChange: () => {},
        onRequiredChange: () => {},
        onSchemaChange,
      }),
    );

  test("turns a field nullable", () => {
    let changed: ObjectJsonSchema | undefined;
    renderProperty(employeeType, (s) => {
      changed = s;
    });
    fireEvent.click(body().getByText("Not null"));
    assert.deepStrictEqual(changed, setNullable(employeeType, true));
  });

  test("turns a nullable field back to not null", () => {
    let changed: ObjectJsonSchema | undefined;
    renderProperty(setNullable(employeeType, true), (s) => {
      changed = s;
    });
    const toggle = body().getByText("Nullable");
    assert.strictEqual(toggle.getAttribute("aria-pressed"), "true");
    fireEvent.click(toggle);
    assert.deepStrictEqual(changed, employeeType);
  });

  test("is hidden in read-only mode unless the field is nullable", () => {
    renderProperty(employeeType, () => {}, true);
    assert.strictEqual(body().queryByText("Not null"), null);
    cleanup();
    renderProperty(setNullable(employeeType, true), () => {}, true);
    assert.ok(body().getByText("Nullable"));
  });

  test("is not shown for the null type", () => {
    renderProperty({ type: "null" }, () => {});
    assert.strictEqual(body().queryByText("Not null"), null);
    assert.strictEqual(body().queryByText("Nullable"), null);
  });
});

describe("TypeEditor keeps a field nullable", () => {
  afterEach(cleanup);

  test("enum edits keep null in type and enum, and hide the null entry", async () => {
    let changed: ObjectJsonSchema | undefined;
    const { container } = render(
      React.createElement(TypeEditor, {
        schema: setNullable(employeeType, true),
        readOnly: false,
        validationNode: undefined,
        onChange: (s: ObjectJsonSchema) => {
          changed = s;
        },
      }),
    );
    await waitFor(() => body().getByText("monthly"));
    assert.ok(!/>null</.test(container.innerHTML));

    const target = body().getByPlaceholderText("Add allowed value...");
    fireEvent.change(target, { target: { value: "daily" } });
    fireEvent.keyDown(target, { key: "Enter" });

    assert.deepStrictEqual(changed, {
      type: ["string", "null"],
      enum: ["monthly", "bimonthly", "daily", null],
      description: "Employee Type",
    });
  });
});
