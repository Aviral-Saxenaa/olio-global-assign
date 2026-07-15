"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import dayjs from "dayjs";
import { api, API_URL } from "@/lib/api";

type Session = {
  user: { id: string; email: string; name: string } | null;
  workspace: { id: string; name: string } | null;
};

type Contact = {
  id: string;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  tags: string[];
  customFields?: Record<string, string> | null;
};

type Audience = {
  id: string;
  name: string;
  filters: Array<{ field: string; operator: string; value: string | string[] }>;
  count: number;
};

type Campaign = {
  id: string;
  name: string;
  subject: string;
  body?: string;
  status: string;
  recipientMode: "AUDIENCE" | "TAG" | "MANUAL";
  tag?: string | null;
  audience?: { id: string; name: string } | null;
  scheduledFor?: string | null;
  manualRecipients?: string[];
  attachments?: CampaignAttachment[];
};

type CampaignAttachment = {
  filename: string;
  contentType: string;
  size: number;
  content: string;
};

type LookupResult = {
  value: string;
  matched: boolean;
  contact?: Contact | null;
};

type Analytics = {
  sent: number;
  delivered: number;
  opened: number;
  status: string;
  scheduledFor?: string | null;
};

const fetcher = <T,>(path: string) => api<T>(path);

const initialContact = {
  email: "",
  phone: "",
  firstName: "",
  lastName: "",
  city: "",
  tags: "",
  customFields: "",
};

export function DashboardApp() {
  const { data: session, mutate: mutateSession } = useSWR<Session>("/auth/me", async (path: string) => {
    try {
      return await api<Session>(path);
    } catch {
      return { user: null, workspace: null };
    }
  });

  const isExample = session?.workspace?.name === "Demo Workspace";

  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [message, setMessage] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [draft, setDraft] = useState<Campaign | null>(null);

  const handleDuplicate = async (campaignId: string) => {
    try {
      const clone = await api<Campaign>(`/campaigns/${campaignId}/duplicate`, { method: "POST" });
      setDraft(clone);
      setSelectedCampaignId(clone.id);
      await mutateCampaigns();
      setMessage(`Duplicated as "${clone.name}". Tweak the copy in the builder, then send.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not duplicate campaign");
    }
  };

  const tenantKey = `${session?.user?.id ?? ""}:${session?.workspace?.id ?? ""}`;
  useEffect(() => {
    setSelectedCampaignId("");
  }, [tenantKey]);

  const { data: contacts, mutate: mutateContacts } = useSWR<Contact[]>(
    session?.user ? "/contacts" : null,
    fetcher,
  );
  const { data: audiences, mutate: mutateAudiences } = useSWR<Audience[]>(
    session?.user ? "/audiences" : null,
    fetcher,
  );
  const { data: campaigns, mutate: mutateCampaigns } = useSWR<Campaign[]>(
    session?.user ? "/campaigns" : null,
    fetcher,
  );
  const { data: analytics } = useSWR<Analytics>(
    selectedCampaignId && session?.user ? `/campaigns/${selectedCampaignId}/analytics` : null,
    fetcher,
    { refreshInterval: 4000 },
  );

  useEffect(() => {
    if (!campaigns) return;
    const stillExists = campaigns.some((campaign) => campaign.id === selectedCampaignId);
    if (!selectedCampaignId || !stillExists) {
      setSelectedCampaignId(campaigns[0]?.id ?? "");
    }
  }, [campaigns, selectedCampaignId]);

  if (!session) {
    return <div className="min-h-screen bg-[var(--page)]" />;
  }

  if (!session.user) {
    return (
      <AuthScreen
        mode={authMode}
        message={message}
        onSwitchMode={setAuthMode}
        onSubmit={async (payload) => {
          setMessage("");
          await api(authMode === "login" ? "/auth/login" : "/auth/signup", {
            method: "POST",
            body: JSON.stringify(payload),
          });
          await mutateSession();
        }}
        onError={setMessage}
      />
    );
  }

  const contactCount = contacts?.length || 0;
  const audienceCount = audiences?.length || 0;
  const campaignCount = campaigns?.length || 0;

  return (
    <main className="min-h-screen bg-[var(--page)] px-4 py-6 text-[var(--ink)] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6">
        <section className="dashboard-shell overflow-hidden">
          <div className="grid gap-6 p-5 lg:grid-cols-[1.2fr_0.8fr] lg:p-7">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.28em] text-[var(--muted)]">
                <span className="rounded-full border border-[var(--line)] bg-white/60 px-3 py-1">Olio Mail</span>
                <span>Workspace control room</span>
              </div>

              <div className="max-w-3xl space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="font-sans text-4xl font-semibold tracking-[-0.04em] text-[var(--ink-strong)] sm:text-5xl">
                    {session.workspace?.name}
                  </h1>
                  {isExample ? <span className="example-badge">Example data</span> : null}
                </div>
                <p className="max-w-2xl text-base leading-7 text-[var(--muted)]">
                  A focused operations surface for audience building, campaign delivery, and post-send visibility.
                </p>
                {isExample ? (
                  <p className="text-sm leading-6 text-[var(--muted)]">
                    These are sample contacts and audiences pre-loaded for exploration. Anything you add shows up here alongside them.
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <StatChip label="Contacts" value={contactCount} tone="blue" />
                <StatChip label="Audiences" value={audienceCount} tone="sand" />
                <StatChip label="Campaigns" value={campaignCount} tone="ink" />
              </div>

              {message ? <BannerMessage message={message} /> : null}
            </div>

            <div className="flex flex-col gap-4 rounded-[28px] border border-[var(--line)] bg-[var(--hero-card)] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Operator</p>
                  <h2 className="mt-2 font-sans text-2xl font-semibold tracking-[-0.04em] text-[var(--ink-strong)]">
                    {session.user.name}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">{session.user.email}</p>
                </div>
                <div className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                  Live
                </div>
              </div>

              <div className="grid gap-3 rounded-[22px] border border-[var(--line)] bg-[var(--soft)] p-4 text-[var(--ink-strong)]">
                <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted)]">Current stack</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <InfoItem label="API" value={API_URL.replace(/^https?:\/\//, "")} />
                  <InfoItem label="Refresh" value="4 sec poll" />
                  <InfoItem label="Isolation" value="Workspace scoped" />
                  <InfoItem label="Queue" value="BullMQ + Redis" />
                </div>
              </div>

              <button
                className="button-secondary w-fit"
                onClick={async () => {
                  await api("/auth/logout", { method: "POST" });
                  await mutateSession({ user: null, workspace: null }, { revalidate: false });
                }}
              >
                Log out
              </button>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <Card
            eyebrow="List building"
            title="Contacts"
            subtitle="Add individual contacts, define custom fields, and import the provided CSV without letting duplicates pile up."
          >
            <ContactManager
              contacts={contacts || []}
              onCreated={async () => {
                await mutateContacts();
              }}
              onImport={async () => {
                await mutateContacts();
              }}
              onMessage={setMessage}
            />
          </Card>

          <Card
            eyebrow="Segmentation"
            title="Audiences"
            subtitle="Save named slices of your list so campaigns can be reused with less setup and fewer mistakes."
          >
            <AudienceManager
              audiences={audiences || []}
              onCreated={async () => {
                await mutateAudiences();
              }}
              onMessage={setMessage}
            />
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card
            eyebrow="Delivery"
            title="Campaign Builder"
            subtitle="Choose an audience, tag, or pasted identities, then send immediately or queue it for later."
          >
            <CampaignManager
              audiences={audiences || []}
              contacts={contacts || []}
              draft={draft}
              onCreated={async () => {
                await mutateCampaigns();
              }}
              onMessage={setMessage}
            />
          </Card>

          <Card
            eyebrow="Reporting"
            title="Analytics"
            subtitle="Watch sent, delivered, and opened totals update without reloading the page."
          >
            <AnalyticsPanel
              campaigns={campaigns || []}
              selectedCampaignId={selectedCampaignId}
              onSelectCampaign={setSelectedCampaignId}
              onDuplicate={handleDuplicate}
              analytics={analytics}
            />
          </Card>
        </div>
      </div>
    </main>
  );
}

function AuthScreen({
  mode,
  message,
  onSwitchMode,
  onSubmit,
  onError,
}: {
  mode: "login" | "signup";
  message: string;
  onSwitchMode: (mode: "login" | "signup") => void;
  onSubmit: (payload: Record<string, string>) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState({
    email: "demo@olio.app",
    password: "password123",
    name: "Demo User",
    workspaceName: "Demo Workspace",
  });

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--page)] px-4 py-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[8%] top-[10%] h-52 w-52 rounded-full bg-[#f3d6bd] blur-3xl" />
        <div className="absolute right-[12%] top-[18%] h-72 w-72 rounded-full bg-[#d9e7f4] blur-3xl" />
        <div className="absolute bottom-[10%] left-[18%] h-64 w-64 rounded-full bg-[#dde7de] blur-3xl" />
      </div>

      <div className="relative grid w-full max-w-6xl gap-6 rounded-[36px] border border-white/70 bg-[rgba(251,248,243,0.84)] p-4 shadow-[0_40px_120px_rgba(39,42,45,0.14)] backdrop-blur md:grid-cols-[1.05fr_0.95fr] md:p-6">
        <section className="rounded-[28px] border border-[var(--line)] bg-[var(--surface)] p-7 text-[var(--ink-strong)] md:p-9">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Olio Mail</p>
          <h1 className="mt-4 max-w-md font-sans text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
            Email operations that feel calm, not chaotic.
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-7 text-[var(--muted)]">
            Contacts, audiences, campaign scheduling, and analytics live in one place, with the rough edges around imports and delivery handled in the background.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <FeaturePill title="Duplicate-safe import" body="Email and phone collisions are reported instead of silently stored." />
            <FeaturePill title="Queued scheduling" body="Future sends flow through Redis and survive restarts." />
            <FeaturePill title="Recipient sanity checks" body="Pasted identities resolve back to known contacts where possible." />
            <FeaturePill title="Live campaign view" body="Polling keeps delivery numbers moving in place." />
          </div>
        </section>

        <section className="rounded-[28px] border border-[var(--line)] bg-[rgba(255,255,255,0.82)] p-5 md:p-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">Access</p>
              <h2 className="mt-2 font-sans text-2xl font-semibold tracking-[-0.04em] text-[var(--ink-strong)]">
                {mode === "login" ? "Welcome back" : "Create your workspace"}
              </h2>
            </div>
            <div className="segmented-control">
              <button
                type="button"
                className={mode === "login" ? "is-active" : ""}
                onClick={() => onSwitchMode("login")}
              >
                Log in
              </button>
              <button
                type="button"
                className={mode === "signup" ? "is-active" : ""}
                onClick={() => onSwitchMode("signup")}
              >
                Sign up
              </button>
            </div>
          </div>

          <form
            className="mt-8 grid gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                await onSubmit(form);
              } catch (error) {
                onError(error instanceof Error ? error.message : "Authentication failed");
              }
            }}
          >
            {mode === "signup" ? (
              <>
                <Input
                  label="Your name"
                  value={form.name}
                  onChange={(value) => setForm((current) => ({ ...current, name: value }))}
                />
                <Input
                  label="Workspace name"
                  value={form.workspaceName}
                  onChange={(value) =>
                    setForm((current) => ({ ...current, workspaceName: value }))
                  }
                />
              </>
            ) : null}

            <Input
              label="Email"
              value={form.email}
              onChange={(value) => setForm((current) => ({ ...current, email: value }))}
            />
            <Input
              label="Password"
              type="password"
              value={form.password}
              onChange={(value) => setForm((current) => ({ ...current, password: value }))}
            />

            <div className="rounded-[22px] border border-[var(--line)] bg-[var(--soft)] px-4 py-3 text-sm text-[var(--muted)]">
              Demo login: <span className="font-medium text-[var(--ink-strong)]">demo@olio.app</span> /{" "}
              <span className="font-medium text-[var(--ink-strong)]">password123</span>
            </div>

            {message ? <BannerMessage message={message} /> : null}

            <button className="button-primary mt-2 w-full">
              {mode === "login" ? "Enter workspace" : "Create account"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function ContactManager({
  contacts,
  onCreated,
  onImport,
  onMessage,
}: {
  contacts: Contact[];
  onCreated: () => Promise<void>;
  onImport: () => Promise<void>;
  onMessage: (value: string) => void;
}) {
  const [form, setForm] = useState(initialContact);
  const [file, setFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  return (
    <div className="grid gap-5">
      {feedback ? <BannerMessage message={feedback} /> : null}
      <div className="grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
        <form
          className="panel-subtle grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              await api("/contacts", {
                method: "POST",
                body: JSON.stringify({
                  ...form,
                  tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
                  customFields: Object.fromEntries(
                    form.customFields
                      .split("\n")
                      .map((entry) => entry.trim())
                      .filter(Boolean)
                      .map((entry) => entry.split(":").map((part) => part.trim())),
                  ),
                }),
              });
              setForm(initialContact);
              setFeedback("Contact added.");
              await onCreated();
            } catch (error) {
              setFeedback(error instanceof Error ? error.message : "Contact could not be saved");
            }
          }}
        >
          <SectionLabel title="Add a contact" meta="Flexible profile fields" />
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Email" value={form.email} onChange={(value) => setForm((current) => ({ ...current, email: value }))} />
            <Input label="Phone" value={form.phone} onChange={(value) => setForm((current) => ({ ...current, phone: value }))} />
            <Input label="First name" value={form.firstName} onChange={(value) => setForm((current) => ({ ...current, firstName: value }))} />
            <Input label="Last name" value={form.lastName} onChange={(value) => setForm((current) => ({ ...current, lastName: value }))} />
            <Input label="City" value={form.city} onChange={(value) => setForm((current) => ({ ...current, city: value }))} />
            <Input label="Tags" value={form.tags} onChange={(value) => setForm((current) => ({ ...current, tags: value }))} placeholder="vip, newsletter" />
          </div>
          <TextArea
            label="Custom fields"
            value={form.customFields}
            onChange={(value) => setForm((current) => ({ ...current, customFields: value }))}
            placeholder={"company: Acme\nplan: pro"}
          />
          <button className="button-dark w-fit">Add contact</button>
        </form>

        <form
          className="panel-subtle flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!file) {
              onMessage("Choose a CSV file first.");
              return;
            }

            const data = new FormData();
            data.append("file", file);

            try {
              const response = await fetch(`${API_URL}/contacts/import`, {
                method: "POST",
                body: data,
                credentials: "include",
              });
              const payload = await response.json();
              if (!response.ok) {
                throw new Error(payload.error || "Import failed");
              }
              setFeedback(`${payload.added} added, ${payload.skipped} skipped as duplicates.`);
              await onImport();
            } catch (error) {
              setFeedback(error instanceof Error ? error.message : "Import failed");
            }
          }}
        >
          <SectionLabel title="Import CSV" meta="Use the provided mock-data fixture" />
          <div className="rounded-[24px] border border-dashed border-[var(--line-strong)] bg-[var(--soft)] p-4">
            <p className="text-sm leading-7 text-[var(--muted)]">
              Duplicate-safe checks run against both email and phone before contact creation. Imports return a clear added versus skipped summary.
            </p>
          </div>
          <label className="upload-field">
            <span className="text-sm font-medium text-[var(--ink-strong)]">
              {file?.name || "Choose a .csv file"}
            </span>
            <span className="text-xs uppercase tracking-[0.22em] text-[var(--muted)]">Browse</span>
            <input type="file" accept=".csv" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          </label>
          <button className="button-primary w-fit">Import CSV</button>
        </form>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {contacts.slice(0, 8).map((contact) => (
          <article key={contact.id} className="contact-row">
            <div className="flex items-start gap-4">
              <div className="avatar-badge">
                {((contact.firstName || contact.email || "?").slice(0, 1)).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate font-sans text-base font-semibold tracking-[-0.03em] text-[var(--ink-strong)]">
                  {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unnamed contact"}
                </p>
                <p className="truncate text-sm text-[var(--muted)]">
                  {contact.email || contact.phone || "No primary address"}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                  {contact.city || "No city"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {contact.tags.length ? (
                contact.tags.map((tag) => (
                  <span key={tag} className="tag-pill">
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">No tags</span>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function AudienceManager({
  audiences,
  onCreated,
  onMessage,
}: {
  audiences: Audience[];
  onCreated: () => Promise<void>;
  onMessage: (value: string) => void;
}) {
  const [name, setName] = useState("");
  const [field, setField] = useState("city");
  const [operator, setOperator] = useState("contains");
  const [value, setValue] = useState("");

  return (
    <div className="grid gap-5">
      <form
        className="panel-subtle grid gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await api("/audiences", {
              method: "POST",
              body: JSON.stringify({ name, filters: [{ field, operator, value }] }),
            });
            setName("");
            setValue("");
            onMessage("Audience saved.");
            await onCreated();
          } catch (error) {
            onMessage(error instanceof Error ? error.message : "Audience could not be created");
          }
        }}
      >
        <SectionLabel title="Create an audience" meta="Save a reusable slice" />
        <Input label="Audience name" value={name} onChange={setName} placeholder="London VIPs" />
        <div className="grid gap-3 md:grid-cols-3">
          <Select label="Field" value={field} onChange={setField} options={["city", "tags", "email", "company", "plan"]} />
          <Select label="Operator" value={operator} onChange={setOperator} options={["contains", "equals"]} />
          <Input label="Value" value={value} onChange={setValue} placeholder="London" />
        </div>
        <button className="button-dark w-fit">Create audience</button>
      </form>

      <div className="grid gap-3">
        {audiences.length ? (
          audiences.map((audience) => (
            <article key={audience.id} className="audience-row">
              <div>
                <p className="font-sans text-lg font-semibold tracking-[-0.03em] text-[var(--ink-strong)]">
                  {audience.name}
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {audience.filters[0]?.field} {audience.filters[0]?.operator}{" "}
                  {Array.isArray(audience.filters[0]?.value)
                    ? audience.filters[0]?.value.join(", ")
                    : audience.filters[0]?.value}
                </p>
              </div>
              <div className="count-badge">{audience.count} contacts</div>
            </article>
          ))
        ) : (
          <EmptyState
            title="No saved audiences yet"
            body="Once you save a filter here, it becomes available in the campaign builder."
          />
        )}
      </div>
    </div>
  );
}

function CampaignManager({
  audiences,
  contacts,
  draft,
  onCreated,
  onMessage,
}: {
  audiences: Audience[];
  contacts: Contact[];
  draft: Campaign | null;
  onCreated: () => Promise<void>;
  onMessage: (value: string) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    subject: "",
    body: "<p>Hello from Olio Mail.</p>",
    recipientMode: "AUDIENCE",
    audienceId: "",
    tag: "",
    manualRecipients: "",
    sendAt: "",
    attachments: [] as CampaignAttachment[],
  });
  const [lookupValues, setLookupValues] = useState<LookupResult[]>([]);

  useEffect(() => {
    if (!draft?.id) return;
    setForm({
      name: draft.name,
      subject: draft.subject,
      body: draft.body ?? "<p>Hello from Olio Mail.</p>",
      recipientMode: draft.recipientMode,
      audienceId: draft.audience?.id ?? "",
      tag: draft.tag ?? "",
      manualRecipients: (draft.manualRecipients ?? []).join("\n"),
      sendAt: "",
      attachments: draft.attachments ?? [],
    });
    setLookupValues([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.id]);

  const tagOptions = useMemo(
    () => Array.from(new Set(contacts.flatMap((contact) => contact.tags))).sort(),
    [contacts],
  );

  useEffect(() => {
    if (form.recipientMode !== "MANUAL" || !form.manualRecipients.trim()) {
      setLookupValues([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        const results = await api<LookupResult[]>(
          `/contacts/lookup?values=${encodeURIComponent(form.manualRecipients)}`,
        );
        setLookupValues(results);
      } catch {
        setLookupValues([]);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [form.manualRecipients, form.recipientMode]);

  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        try {
          await api("/campaigns", {
            method: "POST",
            body: JSON.stringify({
              ...form,
              manualRecipients: form.manualRecipients
                .split(/[\n,]/)
                .map((value) => value.trim())
                .filter(Boolean),
            }),
          });
          onMessage(form.sendAt ? "Campaign scheduled." : "Campaign queued to send.");
          setForm({
            name: "",
            subject: "",
            body: "<p>Hello from Olio Mail.</p>",
            recipientMode: "AUDIENCE",
            audienceId: "",
            tag: "",
            manualRecipients: "",
            sendAt: "",
            attachments: [],
          });
          setLookupValues([]);
          await onCreated();
        } catch (error) {
          onMessage(error instanceof Error ? error.message : "Campaign could not be saved");
        }
      }}
    >
      <div className="panel-subtle grid gap-4">
        <SectionLabel title="Compose" meta="Subject and message content" />
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="Campaign name" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
          <Input label="Subject" value={form.subject} onChange={(value) => setForm((current) => ({ ...current, subject: value }))} />
        </div>
        <TextArea label="HTML body" value={form.body} onChange={(value) => setForm((current) => ({ ...current, body: value }))} rows={8} />

        <div className="grid gap-3">
          <SectionLabel title="Attachment" meta="Optional PDF or document" />
          <label className="field-wrap">
            <span className="field-label">Attach a file</span>
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="field-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const content = (reader.result as string).split(",")[1] ?? "";
                  setForm((current) => ({
                    ...current,
                    attachments: [
                      ...current.attachments,
                      { filename: file.name, contentType: file.type || "application/pdf", size: file.size, content },
                    ],
                  }));
                };
                reader.readAsDataURL(file);
                event.target.value = "";
              }}
            />
          </label>
          {form.attachments.length ? (
            <div className="grid gap-2">
              {form.attachments.map((attachment, index) => (
                <div key={`${attachment.filename}-${index}`} className="flex items-center justify-between gap-3 rounded-[18px] border border-[var(--line)] bg-white px-4 py-2">
                  <span className="truncate text-sm text-[var(--ink-strong)]">{attachment.filename}</span>
                  <button
                    type="button"
                    className="button-ghost px-3 py-1 text-sm"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        attachments: current.attachments.filter((_, itemIndex) => itemIndex !== index),
                      }))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="panel-subtle grid gap-4">
        <SectionLabel title="Choose recipients" meta="Audience, tag, or pasted identities" />
        <div className="mode-switch">
          {(["AUDIENCE", "TAG", "MANUAL"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={form.recipientMode === mode ? "is-active" : ""}
              onClick={() => setForm((current) => ({ ...current, recipientMode: mode }))}
            >
              {mode}
            </button>
          ))}
        </div>

        {form.recipientMode === "AUDIENCE" ? (
          <label className="field-wrap">
            <span className="field-label">Audience</span>
            <select
              className="field-input"
              value={form.audienceId}
              onChange={(event) =>
                setForm((current) => ({ ...current, audienceId: event.target.value }))
              }
            >
              <option value="">Choose...</option>
              {audiences.map((audience) => (
                <option key={audience.id} value={audience.id}>
                  {audience.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {form.recipientMode === "TAG" ? (
          <Select label="Tag" value={form.tag} onChange={(value) => setForm((current) => ({ ...current, tag: value }))} options={tagOptions} />
        ) : null}

        {form.recipientMode === "MANUAL" ? (
          <div className="grid gap-3">
            <TextArea
              label="Paste emails or phone numbers"
              value={form.manualRecipients}
              onChange={(value) =>
                setForm((current) => ({ ...current, manualRecipients: value }))
              }
              placeholder={"ada@example.com\ngrace@example.com\n+15550000001"}
            />
            <div className="rounded-[24px] border border-[var(--line)] bg-white px-4 py-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-[var(--ink-strong)]">Match preview</p>
                <span className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                  {lookupValues.filter((item) => item.matched).length}/{lookupValues.length} matched
                </span>
              </div>
              <div className="grid gap-2">
                {lookupValues.length ? (
                  lookupValues.map((item) => (
                    <div key={item.value} className="lookup-row">
                      <span className="truncate text-sm text-[var(--ink-strong)]">{item.value}</span>
                      <span className={item.matched ? "lookup-match" : "lookup-miss"}>
                        {item.matched
                          ? [item.contact?.firstName, item.contact?.lastName]
                              .filter(Boolean)
                              .join(" ") || item.contact?.email
                          : "No saved contact match"}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[var(--muted)]">
                    Matches will appear here as you paste recipients.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="panel-subtle grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <Input
          label="Schedule for later"
          type="datetime-local"
          value={form.sendAt}
          onChange={(value) => setForm((current) => ({ ...current, sendAt: value }))}
        />
        <button className="button-primary w-full md:w-fit">Save and queue campaign</button>
      </div>
    </form>
  );
}

function AnalyticsPanel({
  campaigns,
  selectedCampaignId,
  onSelectCampaign,
  onDuplicate,
  analytics,
}: {
  campaigns: Campaign[];
  selectedCampaignId: string;
  onSelectCampaign: (value: string) => void;
  onDuplicate: (id: string) => void;
  analytics?: Analytics;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3">
        {campaigns.length ? (
          campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className={`campaign-row ${selectedCampaignId === campaign.id ? "is-selected" : ""}`}
              onClick={() => onSelectCampaign(campaign.id)}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 text-left">
                  <p className="truncate font-sans text-base font-semibold tracking-[-0.03em]">
                    {campaign.name}
                  </p>
                  <p className="truncate text-sm opacity-75">{campaign.subject}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="button-ghost px-3 py-1 text-sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDuplicate(campaign.id);
                    }}
                  >
                    Duplicate
                  </button>
                  <span className="status-pill">{campaign.status}</span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            title="No campaigns yet"
            body="Your saved or scheduled campaigns will appear here for live monitoring."
          />
        )}
      </div>

      {analytics ? (
        <div className="rounded-[30px] border border-[var(--line)] bg-[var(--soft)] p-5 text-[var(--ink-strong)]">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Sent" value={analytics.sent} />
            <Metric label="Delivered" value={analytics.delivered} />
            <Metric label="Opened" value={analytics.opened} />
          </div>
          <p className="mt-4 text-sm text-[var(--muted)]">
            Status: {analytics.status}
            {analytics.scheduledFor
              ? ` | Scheduled ${dayjs(analytics.scheduledFor).format("MMM D, YYYY h:mm A")}`
              : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Card({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="dashboard-shell p-5 lg:p-6">
      <div className="mb-6 space-y-2">
        <p className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">{eyebrow}</p>
        <h2 className="font-sans text-3xl font-semibold tracking-[-0.04em] text-[var(--ink-strong)]">
          {title}
        </h2>
        <p className="max-w-2xl text-sm leading-7 text-[var(--muted)]">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "sand" | "ink";
}) {
  return (
    <div className={`stat-chip stat-${tone}`}>
      <p className="text-[11px] uppercase tracking-[0.22em]">{label}</p>
      <p className="mt-2 font-sans text-3xl font-semibold tracking-[-0.04em]">{value}</p>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 font-sans text-sm font-medium text-[var(--ink-strong)]">{value}</p>
    </div>
  );
}

function BannerMessage({ message }: { message: string }) {
  return (
    <div className="rounded-[20px] border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-4 py-3 text-sm text-[var(--ink-strong)] shadow-[0_10px_30px_rgba(30,34,38,0.05)]">
      {message}
    </div>
  );
}

function FeaturePill({ title, body }: { title: string; body: string }) {
  return (
            <div className="rounded-[22px] border border-[var(--line)] bg-[var(--soft)] p-4">
      <p className="font-sans text-sm font-semibold tracking-[-0.02em]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{body}</p>
    </div>
  );
}

function SectionLabel({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <h3 className="font-sans text-xl font-semibold tracking-[-0.04em] text-[var(--ink-strong)]">
        {title}
      </h3>
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">{meta}</p>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[24px] border border-[var(--line)] bg-[var(--soft)] px-4 py-5">
      <p className="font-sans text-base font-semibold tracking-[-0.03em] text-[var(--ink-strong)]">
        {title}
      </p>
      <p className="mt-2 text-sm leading-7 text-[var(--muted)]">{body}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted)]">{label}</p>
      <p className="mt-2 font-sans text-4xl font-semibold tracking-[-0.05em] text-[var(--ink-strong)]">
        {value}
      </p>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="field-wrap">
      <span className="field-label">{label}</span>
      <input
        className="field-input"
        value={value}
        type={type}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows = 5,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="field-wrap">
      <span className="field-label">{label}</span>
      <textarea
        className="field-input min-h-[140px] resize-y"
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="field-wrap">
      <span className="field-label">{label}</span>
      <select
        className="field-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Choose...</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
