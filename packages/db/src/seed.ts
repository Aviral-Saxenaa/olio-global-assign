import bcrypt from "bcryptjs";
import { Contact, Membership, User, Workspace, syncDatabase } from "./index.js";

await syncDatabase({ alter: true });

const passwordHash = await bcrypt.hash("password123", 10);

const [user] = await User.findOrCreate({
  where: { email: "demo@olio.app" },
  defaults: {
    name: "Demo User",
    passwordHash,
  },
});

if (user.passwordHash !== passwordHash) {
  user.passwordHash = passwordHash;
  user.name = "Demo User";
  await user.save();
}

const [workspace] = await Workspace.findOrCreate({
  where: { name: "Demo Workspace" },
  defaults: { name: "Demo Workspace" },
});

await Membership.findOrCreate({
  where: { userId: user.id, workspaceId: workspace.id },
  defaults: {
    userId: user.id,
    workspaceId: workspace.id,
    role: "owner",
  },
});

await Contact.bulkCreate(
  [
    {
      workspaceId: workspace.id,
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      city: "London",
      tags: ["vip", "engineering"],
      customFields: { company: "Analytical Engines", plan: "enterprise" },
    },
    {
      workspaceId: workspace.id,
      email: "grace@example.com",
      firstName: "Grace",
      lastName: "Hopper",
      city: "New York",
      tags: ["newsletter"],
      customFields: { company: "US Navy", plan: "pro" },
    },
  ],
  {
    ignoreDuplicates: true,
  },
);

console.log("Seed complete");
