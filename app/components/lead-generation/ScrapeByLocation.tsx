'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Filter,
  HelpCircle,
  Loader2,
  Mail,
  MapPin,
  MoreHorizontal,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { cn } from '../../lib/utils';

type LeadStatus = 'email_found' | 'no_email' | 'needs_review';
type DuplicateStatus = 'unique' | 'possible_duplicate' | 'duplicate';

interface SearchRow {
  id: string;
  keyword: string;
  region: string;
  maxResults: number;
}

interface LeadRow {
  id: string;
  business: string;
  category: string;
  city: string;
  phone: string;
  website: string;
  email: string;
  contactPage: string;
  rating: string;
  sourceQuery: string;
  confidence: number;
  status: LeadStatus;
  duplicateStatus: DuplicateStatus;
  address: string;
  notes: string;
}

const TEMPLATES = [
  {
    id: 'digital-labels',
    label: 'Digital Labels',
    description: 'Label printers, converters, and packaging shops',
    keywords: [
      'digital label printer',
      'label converter',
      'packaging printer',
      'commercial label printing',
      'flexographic label printer',
      'label manufacturer',
      'packaging converter',
    ],
  },
  {
    id: 'cannabis',
    label: 'Cannabis Co-Packers',
    description: 'Licensed producers, cultivators, packaging partners',
    keywords: [
      'cannabis cultivator',
      'cannabis producer',
      'cannabis co packer',
      'cannabis contract manufacturer',
      'cannabis packaging',
    ],
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Start from your own keywords',
    keywords: [''],
  },
];

const STARTER_REGIONS = ['Toronto ON', 'Mississauga ON', 'Brampton ON', 'Hamilton ON', 'Kitchener ON'];

const MOCK_LEADS: LeadRow[] = [
  {
    id: 'lead-1',
    business: 'Allcan Label & Packaging Inc.',
    category: 'Label Manufacturer',
    city: 'Toronto',
    phone: '(416) 742-8323',
    website: 'allcanlabel.com',
    email: 'info@allcanlabel.com',
    contactPage: '/contact-us',
    rating: '4.7',
    sourceQuery: 'label manufacturer in Toronto ON',
    confidence: 92,
    status: 'email_found',
    duplicateStatus: 'unique',
    address: '80 Wingold Ave, Toronto, ON M6B 1P5',
    notes: 'Found email on contact page. Strong fit for label and packaging workflows.',
  },
  {
    id: 'lead-2',
    business: 'Labelway Inc.',
    category: 'Digital Label Printer',
    city: 'Mississauga',
    phone: '(905) 565-2230',
    website: 'labelway.com',
    email: 'sales@labelway.com',
    contactPage: '/contact-us',
    rating: '4.6',
    sourceQuery: 'digital label printer in Mississauga ON',
    confidence: 91,
    status: 'email_found',
    duplicateStatus: 'unique',
    address: 'Mississauga, ON',
    notes: 'Website and email found. Appears relevant to short-run digital labels.',
  },
  {
    id: 'lead-3',
    business: 'Royal Label Printing',
    category: 'Commercial Label Printing',
    city: 'Brampton',
    phone: '(905) 790-5552',
    website: 'royallabelprinting.com',
    email: '',
    contactPage: '/',
    rating: '4.2',
    sourceQuery: 'commercial label printing in Brampton ON',
    confidence: 74,
    status: 'no_email',
    duplicateStatus: 'possible_duplicate',
    address: 'Brampton, ON',
    notes: 'No visible email found. Contact form may require manual review.',
  },
  {
    id: 'lead-4',
    business: 'Sun Labels & Packaging',
    category: 'Label Manufacturer',
    city: 'Hamilton',
    phone: '(905) 574-7412',
    website: 'sunlabels.ca',
    email: 'contact@sunlabels.ca',
    contactPage: '/contact',
    rating: '4.4',
    sourceQuery: 'label manufacturer in Hamilton ON',
    confidence: 89,
    status: 'email_found',
    duplicateStatus: 'unique',
    address: 'Hamilton, ON',
    notes: 'Good regional lead. Found contact page and primary email.',
  },
  {
    id: 'lead-5',
    business: "Oliver's Labels",
    category: 'Digital Label Printer',
    city: 'Toronto',
    phone: '(416) 970-9777',
    website: 'oliverslabels.com',
    email: '',
    contactPage: '/',
    rating: '4.3',
    sourceQuery: 'digital label printer in Toronto ON',
    confidence: 71,
    status: 'no_email',
    duplicateStatus: 'unique',
    address: 'Toronto, ON',
    notes: 'Relevant category, but email was not found during shallow crawl.',
  },
  {
    id: 'lead-6',
    business: 'Resource Label Group',
    category: 'Packaging Converter',
    city: 'Mississauga',
    phone: '(905) 602-3300',
    website: 'resourcelabel.com',
    email: 'hello@resourcelabel.com',
    contactPage: '/contact-us',
    rating: '4.5',
    sourceQuery: 'packaging converter in Mississauga ON',
    confidence: 87,
    status: 'email_found',
    duplicateStatus: 'unique',
    address: 'Mississauga, ON',
    notes: 'Packaging converter match with contact page email.',
  },
  {
    id: 'lead-7',
    business: 'Printcloud',
    category: 'Digital Label Printer',
    city: 'Toronto',
    phone: '',
    website: 'printcloud.ca',
    email: '',
    contactPage: '/contact',
    rating: '',
    sourceQuery: 'digital label printer in Toronto ON',
    confidence: 60,
    status: 'needs_review',
    duplicateStatus: 'unique',
    address: 'Toronto, ON',
    notes: 'Low information lead. Needs manual review before export.',
  },
  {
    id: 'lead-8',
    business: 'Tripak Corp.',
    category: 'Packaging Converter',
    city: 'Kitchener',
    phone: '(519) 650-2000',
    website: 'tripakcorp.com',
    email: 'sales@tripakcorp.com',
    contactPage: '/contact-us',
    rating: '4.6',
    sourceQuery: 'packaging converter in Kitchener ON',
    confidence: 90,
    status: 'email_found',
    duplicateStatus: 'unique',
    address: 'Kitchener, ON',
    notes: 'High fit packaging converter with direct sales contact.',
  },
];

function StatusPill({ status }: { status: LeadStatus }) {
  const map = {
    email_found: 'border-green-200 bg-green-50 text-green-700',
    no_email: 'border-orange-200 bg-orange-50 text-orange-700',
    needs_review: 'border-blue-200 bg-blue-50 text-blue-700',
  };
  const label = status === 'email_found' ? 'Email found' : status === 'no_email' ? 'No email' : 'Needs review';
  return <span className={cn('inline-flex rounded border px-1.5 py-0.5 text-2xs font-medium', map[status])}>{label}</span>;
}

function ConfidenceBadge({ score }: { score: number }) {
  const color =
    score >= 85
      ? 'border-green-200 bg-green-50 text-green-700'
      : score >= 70
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-orange-200 bg-orange-50 text-orange-700';
  return <span className={cn('inline-flex rounded border px-1.5 py-0.5 text-2xs font-semibold', color)}>{score}%</span>;
}

export function ScrapeByLocation() {
  const [activeTemplate, setActiveTemplate] = useState('digital-labels');
  const [keywords, setKeywords] = useState(TEMPLATES[0].keywords.join('\n'));
  const [regions, setRegions] = useState(STARTER_REGIONS.join('\n'));
  const [maxResults, setMaxResults] = useState(10);
  const [enrichWebsites, setEnrichWebsites] = useState(true);
  const [dedupe, setDedupe] = useState(true);
  const [aiPrompt, setAiPrompt] = useState('Find Ontario companies likely to need digital label printing, packaging, or co-packing equipment.');
  const [selectedLeadId, setSelectedLeadId] = useState(MOCK_LEADS[0].id);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set(['lead-1', 'lead-2', 'lead-4']));
  const [statusFilter, setStatusFilter] = useState('all');
  const [queryFilter, setQueryFilter] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);

  const keywordList = useMemo(() => keywords.split('\n').map((value) => value.trim()).filter(Boolean), [keywords]);
  const regionList = useMemo(() => regions.split('\n').map((value) => value.trim()).filter(Boolean), [regions]);
  const searchRows = useMemo<SearchRow[]>(() => {
    const rows: SearchRow[] = [];
    for (const region of regionList) {
      for (const keyword of keywordList) {
        rows.push({ id: `${keyword}-${region}`, keyword, region, maxResults });
      }
    }
    return rows;
  }, [keywordList, regionList, maxResults]);

  const filteredLeads = useMemo(() => {
    return MOCK_LEADS.filter((lead) => {
      if (statusFilter !== 'all' && lead.status !== statusFilter) return false;
      if (!queryFilter) return true;
      const q = queryFilter.toLowerCase();
      return (
        lead.business.toLowerCase().includes(q) ||
        lead.category.toLowerCase().includes(q) ||
        lead.city.toLowerCase().includes(q) ||
        lead.sourceQuery.toLowerCase().includes(q) ||
        lead.website.toLowerCase().includes(q)
      );
    });
  }, [queryFilter, statusFilter]);

  const selectedLead = MOCK_LEADS.find((lead) => lead.id === selectedLeadId) ?? MOCK_LEADS[0];
  const emailCount = MOCK_LEADS.filter((lead) => lead.status === 'email_found').length;
  const reviewCount = MOCK_LEADS.filter((lead) => lead.status !== 'email_found').length;
  const commandPreview = `python scripts/run_pipeline.py --input input/${activeTemplate === 'cannabis' ? 'ontario-cannabis-copackers-searches.csv' : 'arrow-label-searches-ontario.csv'} --output output/final_leads.csv`;

  const applyTemplate = (templateId: string) => {
    const template = TEMPLATES.find((item) => item.id === templateId) ?? TEMPLATES[0];
    setActiveTemplate(template.id);
    setKeywords(template.keywords.join('\n'));
  };

  const draftWithAi = () => {
    setIsDrafting(true);
    window.setTimeout(() => {
      if (aiPrompt.toLowerCase().includes('cannabis')) {
        applyTemplate('cannabis');
      } else {
        applyTemplate('digital-labels');
      }
      setRegions(STARTER_REGIONS.join('\n'));
      setIsDrafting(false);
    }, 650);
  };

  const toggleSelected = (id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-primary">
      <div className="border-b border-hub-border bg-white px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10">
                <MapPin className="h-4 w-4 text-brand" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-neutral-900">Scrape by Location</h1>
                <p className="text-xs text-neutral-500">Build lead lists from Places search phrases, regions, website enrichment, and dedupe.</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
            <button className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand px-3 text-xs font-semibold text-white hover:bg-brand/90">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Save run
            </button>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)_300px] overflow-hidden">
        <aside className="overflow-y-auto border-r border-hub-border bg-white">
          <div className="border-b border-hub-border p-4">
            <h2 className="text-sm font-semibold text-neutral-900">Search builder</h2>
            <p className="mt-1 text-2xs text-neutral-500">The API receives each row as: keyword in region.</p>
          </div>

          <div className="space-y-4 p-4">
            <div>
              <label className="mb-1.5 block text-2xs font-semibold uppercase tracking-wide text-neutral-500">Template</label>
              <div className="grid grid-cols-1 gap-2">
                {TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => applyTemplate(template.id)}
                    className={cn(
                      'rounded-md border px-3 py-2 text-left transition-colors',
                      activeTemplate === template.id
                        ? 'border-brand/40 bg-brand/5'
                        : 'border-neutral-200 bg-white hover:bg-neutral-50',
                    )}
                  >
                    <span className="block text-xs font-semibold text-neutral-900">{template.label}</span>
                    <span className="mt-0.5 block text-2xs text-neutral-500">{template.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-blue-700" />
                <h3 className="text-xs font-semibold text-blue-950">AI keyword helper</h3>
              </div>
              <textarea
                value={aiPrompt}
                onChange={(event) => setAiPrompt(event.target.value)}
                rows={3}
                className="w-full resize-none rounded-md border border-blue-200 bg-white px-2 py-1.5 text-xs text-neutral-800 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
              <button
                type="button"
                onClick={draftWithAi}
                className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-md bg-blue-600 px-2.5 text-2xs font-semibold text-white hover:bg-blue-700"
              >
                {isDrafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Suggest keywords
              </button>
            </div>

            <div>
              <label className="mb-1.5 flex items-center justify-between text-2xs font-semibold uppercase tracking-wide text-neutral-500">
                Keywords or phrases
                <span className="font-normal normal-case tracking-normal text-neutral-400">{keywordList.length} terms</span>
              </label>
              <textarea
                value={keywords}
                onChange={(event) => setKeywords(event.target.value)}
                rows={8}
                className="w-full resize-none rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-800 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </div>

            <div>
              <label className="mb-1.5 flex items-center justify-between text-2xs font-semibold uppercase tracking-wide text-neutral-500">
                Regions
                <span className="font-normal normal-case tracking-normal text-neutral-400">{regionList.length} regions</span>
              </label>
              <textarea
                value={regions}
                onChange={(event) => setRegions(event.target.value)}
                rows={5}
                className="w-full resize-none rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-800 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1.5 block text-2xs font-semibold uppercase tracking-wide text-neutral-500">Max results</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={maxResults}
                  onChange={(event) => setMaxResults(Number(event.target.value))}
                  className="h-8 w-full rounded-md border border-neutral-200 px-2 text-xs outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </label>
              <div>
                <span className="mb-1.5 block text-2xs font-semibold uppercase tracking-wide text-neutral-500">Searches</span>
                <div className="flex h-8 items-center rounded-md border border-neutral-200 bg-neutral-50 px-2 text-xs font-semibold text-neutral-800">
                  {searchRows.length}
                </div>
              </div>
            </div>

            <div className="space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
              <label className="flex items-center gap-2 text-xs text-neutral-700">
                <input type="checkbox" checked={enrichWebsites} onChange={(event) => setEnrichWebsites(event.target.checked)} />
                Enrich websites for emails/contact pages
              </label>
              <label className="flex items-center gap-2 text-xs text-neutral-700">
                <input type="checkbox" checked={dedupe} onChange={(event) => setDedupe(event.target.checked)} />
                Dedupe by place ID, website, phone, and address
              </label>
            </div>

            <button className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-brand text-xs font-semibold text-white hover:bg-brand/90">
              <Search className="h-4 w-4" />
              Start location scrape
            </button>

            <div className="rounded-md border border-neutral-200 bg-white p-3">
              <div className="mb-2 flex items-center gap-2">
                <HelpCircle className="h-3.5 w-3.5 text-neutral-400" />
                <span className="text-xs font-semibold text-neutral-800">Command preview</span>
              </div>
              <pre className="overflow-x-auto rounded bg-neutral-950 px-2 py-2 text-2xs leading-relaxed text-neutral-100">
                <code>{commandPreview}</code>
              </pre>
            </div>
          </div>
        </aside>

        <main className="min-w-0 overflow-y-auto">
          <div className="border-b border-hub-border bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-neutral-900">Review Leads</h2>
                <p className="text-2xs text-neutral-500">
                  Preview of a completed Ontario run. Backend execution will connect this screen to the local pipeline.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex rounded-md border border-green-200 bg-green-50 px-2 py-1 text-2xs font-medium text-green-700">
                  Local Business Data ready
                </span>
                <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-700">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4 p-4">
            <section className="grid grid-cols-4 gap-3">
              <div className="rounded-lg border border-hub-border bg-white p-3">
                <div className="flex items-center justify-between">
                  <FileSpreadsheet className="h-4 w-4 text-brand" />
                  <span className="text-2xs text-neutral-400">API</span>
                </div>
                <p className="mt-2 text-lg font-bold text-neutral-900">347</p>
                <p className="text-2xs text-neutral-500">Raw leads</p>
              </div>
              <div className="rounded-lg border border-hub-border bg-white p-3">
                <div className="flex items-center justify-between">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-2xs text-neutral-400">Dedupe</span>
                </div>
                <p className="mt-2 text-lg font-bold text-neutral-900">221</p>
                <p className="text-2xs text-neutral-500">After dedupe</p>
              </div>
              <div className="rounded-lg border border-hub-border bg-white p-3">
                <div className="flex items-center justify-between">
                  <Mail className="h-4 w-4 text-amber-600" />
                  <span className="text-2xs text-neutral-400">Enriched</span>
                </div>
                <p className="mt-2 text-lg font-bold text-neutral-900">{emailCount}</p>
                <p className="text-2xs text-neutral-500">Emails found</p>
              </div>
              <div className="rounded-lg border border-hub-border bg-white p-3">
                <div className="flex items-center justify-between">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  <span className="text-2xs text-neutral-400">Review</span>
                </div>
                <p className="mt-2 text-lg font-bold text-neutral-900">{reviewCount}</p>
                <p className="text-2xs text-neutral-500">Need review</p>
              </div>
            </section>

            <section className="rounded-lg border border-hub-border bg-white">
              <div className="flex flex-wrap items-center gap-2 border-b border-hub-border p-3">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
                  <input
                    value={queryFilter}
                    onChange={(event) => setQueryFilter(event.target.value)}
                    placeholder="Search businesses, websites, emails..."
                    className="h-8 w-full rounded-md border border-neutral-200 bg-white pl-8 pr-3 text-xs outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-700"
                >
                  <option value="all">All email statuses</option>
                  <option value="email_found">Email found</option>
                  <option value="no_email">No email</option>
                  <option value="needs_review">Needs review</option>
                </select>
                <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 px-2.5 text-xs text-neutral-700">
                  <Filter className="h-3.5 w-3.5" />
                  More filters
                </button>
                <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 px-2.5 text-xs text-neutral-700">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Columns
                </button>
              </div>

              <div className="border-b border-hub-border bg-neutral-50 px-3 py-2 text-2xs text-neutral-500">
                <span className="font-semibold text-neutral-800">{selectedRows.size} selected</span>
                <button className="ml-3 text-brand hover:underline" type="button">
                  Select all 221
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left">
                  <thead className="border-b border-hub-border bg-neutral-50 text-2xs uppercase tracking-wide text-neutral-500">
                    <tr>
                      <th className="w-9 px-3 py-2" />
                      <th className="px-3 py-2">Business</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">City</th>
                      <th className="px-3 py-2">Phone</th>
                      <th className="px-3 py-2">Website</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Source Query</th>
                      <th className="px-3 py-2">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hub-border text-xs">
                    {filteredLeads.map((lead) => (
                      <tr
                        key={lead.id}
                        className={cn(
                          'cursor-pointer hover:bg-neutral-50',
                          selectedLead.id === lead.id && 'bg-brand/5',
                        )}
                        onClick={() => setSelectedLeadId(lead.id)}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selectedRows.has(lead.id)}
                            onChange={() => toggleSelected(lead.id)}
                            onClick={(event) => event.stopPropagation()}
                          />
                        </td>
                        <td className="px-3 py-2 font-medium text-neutral-900">{lead.business}</td>
                        <td className="px-3 py-2 text-neutral-600">{lead.category}</td>
                        <td className="px-3 py-2 text-neutral-600">{lead.city}</td>
                        <td className="px-3 py-2 text-neutral-600">{lead.phone || '-'}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1 text-brand">
                            {lead.website}
                            <ExternalLink className="h-3 w-3" />
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <StatusPill status={lead.status} />
                        </td>
                        <td className="max-w-[190px] px-3 py-2 text-2xs leading-4 text-neutral-500">{lead.sourceQuery}</td>
                        <td className="px-3 py-2">
                          <ConfidenceBadge score={lead.confidence} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </main>

        <aside className="overflow-y-auto border-l border-hub-border bg-white">
          <div className="flex items-center justify-between border-b border-hub-border px-4 py-3">
            <h2 className="text-sm font-semibold text-neutral-900">{selectedLead.business}</h2>
            <button className="text-neutral-400 hover:text-neutral-700">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-5 p-4">
            <section>
              <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-neutral-500">Business info</h3>
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-neutral-500">Category</dt>
                  <dd className="text-right font-medium text-neutral-800">{selectedLead.category}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-neutral-500">Address</dt>
                  <dd className="text-right text-neutral-800">{selectedLead.address}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-neutral-500">Phone</dt>
                  <dd className="text-right text-neutral-800">{selectedLead.phone || '-'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-neutral-500">Website</dt>
                  <dd className="inline-flex items-center gap-1 text-right text-brand">{selectedLead.website}<ExternalLink className="h-3 w-3" /></dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-neutral-500">Email</dt>
                  <dd className="text-right text-neutral-800">{selectedLead.email || '-'}</dd>
                </div>
              </dl>
            </section>

            <section>
              <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-neutral-500">Source</h3>
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-neutral-500">Source query</dt>
                  <dd className="text-right text-neutral-800">{selectedLead.sourceQuery}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-neutral-500">API</dt>
                  <dd className="text-right text-neutral-800">Local Business Data</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-neutral-500">Confidence</dt>
                  <dd>
                    <ConfidenceBadge score={selectedLead.confidence} />
                  </dd>
                </div>
              </dl>
            </section>

            <section>
              <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-neutral-500">Enrichment</h3>
              <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
                <p>{selectedLead.notes}</p>
                <div className="mt-3 flex items-center gap-2">
                  <StatusPill status={selectedLead.status} />
                  <span className="rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-2xs font-medium text-green-700">
                    {selectedLead.duplicateStatus === 'unique' ? 'Unique' : 'Review duplicate'}
                  </span>
                </div>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-neutral-500">Actions</h3>
              <div className="grid grid-cols-2 gap-2">
                <button className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-neutral-200 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open site
                </button>
                <button className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-neutral-200 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
                  <Copy className="h-3.5 w-3.5" />
                  Copy email
                </button>
                <button className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-neutral-200 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
                  <Bookmark className="h-3.5 w-3.5" />
                  Save lead
                </button>
                <button className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-red-200 text-xs font-medium text-red-700 hover:bg-red-50">
                  <Trash2 className="h-3.5 w-3.5" />
                  Exclude
                </button>
              </div>
            </section>

            <section className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
                <p className="text-2xs leading-4 text-amber-800">
                  This screen is ready for the pipeline hook. For now, run execution still happens through the local Python scripts.
                </p>
              </div>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}
