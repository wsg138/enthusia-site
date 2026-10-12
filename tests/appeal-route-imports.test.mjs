import test from "node:test";

test("appeal lifecycle route modules resolve their production imports", async () => {
  await Promise.all([
    import("../functions/api/appeals/[id]/edit.js"),
    import("../functions/api/reviewer/appeals/[id]/claim.js"),
    import("../functions/api/reviewer/appeals/[id]/reopen.js")
  ]);
});
