"use client";

// cspell:ignore actuals ritm

import { Download, Eye, PenLine } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { MultiSelectFilter } from "@/components/finance/multi-select-filter";
import { FinancePageIntro } from "@/components/finance/page-intro";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { MONTH_NAMES } from "@/lib/finance/constants";
import {
	formatCurrency,
	formatNumber,
	formatPercent,
} from "@/lib/finance/format";
import { cn } from "@/lib/utils";

type TrackingYearOption = {
	id: string;
	year: number;
	isActive: boolean;
};

type SummaryRow = {
	id: string;
	domain: string | null;
	subDomain: string | null;
	funding: string | null;
	pillar: string | null;
	costCenter: string | null;
	projectCode: string | null;
	displayName: string;
	budget: number;
	amountGivenBudget: number;
	financeViewBudget: number;
	spentToDate: number;
	remainingBudget: number;
	totalForecast: number;
	forecastRemaining: number;
	permBudget: number;
	extBudget: number;
	amsBudget: number;
	permTarget: number;
	permForecast: number;
	extForecast: number;
	amsForecast: number;
	cloudCostTarget: number;
	cloudCostForecast: number;
	seatCount: number;
	activeSeatCount: number;
	openSeatCount: number;
};

type ForecastBucket = "perm" | "ext" | "ams" | "cloud";

type SeatRow = {
	id: string;
	seatId: string;
	budgetAreaId?: string | null;
	domain: string | null;
	subDomain: string | null;
	projectCode: string | null;
	team: string | null;
	inSeat: string | null;
	resourceType: string | null;
	description?: string | null;
	band: string | null;
	location: string | null;
	status: string | null;
	allocation: number;
	totalSpent: number;
	totalForecast: number;
	permFte?: number;
	extFte?: number;
	amsFte?: number;
	hasForecastAdjustments?: boolean;
	yearlyCostInternal: number;
	yearlyCostExternal: number;
	spendPlanId: string | null;
	ritm: string | null;
	sow: string | null;
	notes: string | null;
	startDate?: string | Date | null;
	endDate?: string | Date | null;
	monthlyForecast: number[];
	months: {
		monthIndex: number;
		actualAmountDkk: number;
		actualAmountRaw: number | null;
		actualCurrency: "DKK" | "EUR" | "USD";
		exchangeRateUsed: number | null;
		comparisonForecastAmount?: number;
		forecastIncluded: boolean;
		notes: string | null;
	}[];
};

type WorkspaceProps = {
	activeYear: number;
	trackingYears: TrackingYearOption[];
	summary: SummaryRow[];
	seats: SeatRow[];
	selectedAreaId: string | null;
	statusDefinitions: {
		id: string;
		label: string;
		isActiveStatus: boolean;
		sortOrder: number;
	}[];
	trackerTeamFilters: string[];
	trackerTeamOptions: string[];
	missingActualMonthFilters: string[];
	missingActualMonthOptions: readonly string[];
	openSeatsOnly: boolean;
	showCancelledSeats: boolean;
	hasUnrestrictedDomainExportAccess: boolean;
	exportableDomains: string[];
	seatSortField?: string;
	seatSortDirection?: string;
};

type SeatSortField = "seat" | "resource" | "type" | "alloc";
type SeatSortDirection = "asc" | "desc";

const UNMAPPED_DOMAIN_FILTER = "__unmapped__";
type MonthName = (typeof MONTH_NAMES)[number];

async function fetchJson(input: RequestInfo, init?: RequestInit) {
	const response = await fetch(input, init);
	const body = await response.json();

	if (!response.ok) {
		throw new Error(body.error || "Request failed");
	}

	return body;
}

function formatDate(value: string | Date) {
	return new Intl.DateTimeFormat("en-GB", {
		year: "numeric",
		month: "short",
		day: "numeric",
	}).format(new Date(value));
}

function formatOptionalDate(value: string | Date | null | undefined) {
	return value ? formatDate(value) : "No date";
}

function formatForecastCoverage(seat: SeatRow) {
	const coveredMonths = seat.months
		.filter((month) => {
			const actualAmount = month.actualAmountRaw ?? month.actualAmountDkk ?? 0;
			return (
				(seat.monthlyForecast[month.monthIndex] ?? 0) > 0 && actualAmount <= 0
			);
		})
		.map((month) => month.monthIndex);

	if (coveredMonths.length === 0) {
		return "No remaining forecast months";
	}

	const firstMonth = MONTH_NAMES[coveredMonths[0]];
	const lastMonth = MONTH_NAMES[coveredMonths[coveredMonths.length - 1]];

	if (coveredMonths.length === 1) {
		return `${firstMonth} (${coveredMonths.length})`;
	}

	return `${firstMonth}-${lastMonth} (${coveredMonths.length})`;
}

function getDomainFilterValue(domain: string | null | undefined) {
	const trimmed = domain?.trim();
	return trimmed ? trimmed : UNMAPPED_DOMAIN_FILTER;
}

function normalizeLookupValue(value: string | null | undefined) {
	return value?.trim().toLowerCase() ?? "";
}

function isOpenSeatStatus(
	status: string | null | undefined,
	openStatuses?: Set<string>,
) {
	const normalizedStatus = (status || "").trim().toLowerCase();

	if (!normalizedStatus) {
		return false;
	}

	if (openStatuses && openStatuses.size > 0) {
		return openStatuses.has(normalizedStatus);
	}

	return normalizedStatus === "open";
}

function isCancelledSeatStatus(status: string | null | undefined) {
	const normalizedStatus = (status || "").trim().toLowerCase();

	return (
		normalizedStatus === "cancelled" ||
		normalizedStatus === "cancelled- account still active in ad"
	);
}

function sumQuarter(values: number[], quarterIndex: number) {
	const start = quarterIndex * 3;
	return values.slice(start, start + 3).reduce((sum, value) => sum + value, 0);
}

function getQuarterlySpent(seat: SeatRow) {
	return Array.from({ length: 4 }, (_, quarterIndex) =>
		sumQuarter(
			Array.from({ length: 12 }, (_, monthIndex) => {
				const month = seat.months.find(
					(entry) => entry.monthIndex === monthIndex,
				);
				return month?.actualAmountDkk ?? 0;
			}),
			quarterIndex,
		),
	);
}

function getSeatStartMonthIndex(seat: SeatRow, activeYear: number) {
	if (!seat.startDate) {
		return null;
	}

	const startDate = new Date(seat.startDate);

	if (startDate.getFullYear() > activeYear) {
		return Number.POSITIVE_INFINITY;
	}

	if (startDate.getFullYear() < activeYear) {
		return 0;
	}

	return startDate.getMonth();
}

function normalizeForecastBucket(value: string | null): ForecastBucket | null {
	return value === "perm" ||
		value === "ext" ||
		value === "ams" ||
		value === "cloud"
		? value
		: null;
}

function getForecastBucketLabel(bucket: ForecastBucket | null) {
	if (bucket === "perm") {
		return "PERM forecast seats";
	}

	if (bucket === "ext") {
		return "EXT forecast seats";
	}

	if (bucket === "cloud") {
		return "Cloud forecast seats";
	}

	if (bucket === "ams") {
		return "AMS forecast seats";
	}

	return null;
}

function isCloudSeatType(resourceType: string | null | undefined) {
	return (resourceType || "").trim().toLowerCase() === "cloud";
}

function isAmsSeatType(resourceType: string | null | undefined) {
	const normalizedResourceType = (resourceType || "").trim().toLowerCase();

	return (
		normalizedResourceType.includes("managed service") ||
		normalizedResourceType.includes("managed services") ||
		normalizedResourceType.includes("ams")
	);
}

function isLicenseSeatType(resourceType: string | null | undefined) {
	const normalizedResourceType = (resourceType || "").trim().toLowerCase();

	return (
		normalizedResourceType.includes("license") ||
		normalizedResourceType.includes("licence")
	);
}

export function FinanceWorkspace({
	activeYear,
	trackingYears,
	summary,
	seats,
	selectedAreaId,
	statusDefinitions,
	trackerTeamFilters,
	trackerTeamOptions,
	missingActualMonthFilters,
	missingActualMonthOptions,
	openSeatsOnly,
	showCancelledSeats,
	hasUnrestrictedDomainExportAccess,
	exportableDomains,
	seatSortField,
	seatSortDirection,
}: WorkspaceProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const seatFilterFormRef = useRef<HTMLFormElement | null>(null);
	const [isPending, startTransition] = useTransition();
	const initialSelectedAreaId = selectedAreaId ?? summary[0]?.id ?? null;
	const [isAreaLoading, setIsAreaLoading] = useState(
		Boolean(initialSelectedAreaId) && seats.length === 0,
	);
	const [activeSummaryAreaId, setActiveSummaryAreaId] = useState(
		initialSelectedAreaId,
	);
	const [areaSeats, setAreaSeats] = useState(seats);
	const [selectedSeatId, setSelectedSeatId] = useState(seats[0]?.id ?? "");
	const [showSpentQuarterly, setShowSpentQuarterly] = useState(false);
	const [showForecastQuarterly, setShowForecastQuarterly] = useState(false);
	const [isExportingDomainCsv, setIsExportingDomainCsv] = useState(false);
	const [openSeatsOnlyDraft, setOpenSeatsOnlyDraft] = useState(openSeatsOnly);
	const [showCancelledSeatsDraft, setShowCancelledSeatsDraft] =
		useState(showCancelledSeats);
	const [detailDialogSeatId, setDetailDialogSeatId] = useState<string | null>(
		null,
	);

	const summaryTotals = useMemo(
		() =>
			summary.reduce(
				(totals, row) => ({
					budget: totals.budget + row.budget,
					amountGivenBudget: totals.amountGivenBudget + row.amountGivenBudget,
					financeViewBudget: totals.financeViewBudget + row.financeViewBudget,
					spent: totals.spent + row.spentToDate,
					forecast: totals.forecast + row.totalForecast,
					seatCount: totals.seatCount + row.seatCount,
				}),
				{
					budget: 0,
					amountGivenBudget: 0,
					financeViewBudget: 0,
					spent: 0,
					forecast: 0,
					seatCount: 0,
				},
			),
		[summary],
	);
	const formatBudgetSummaryAmount = (value: number) => {
		const normalized = Number.isFinite(value) ? value : 0;
		const absoluteFormatted = formatCurrency(Math.abs(normalized)).replace(
			/^DKK\s*/,
			"",
		);

		return normalized < 0 ? `(${absoluteFormatted})` : absoluteFormatted;
	};
	const activeDomainFilter = searchParams.get("domain")?.trim() ?? "";
	const activeForecastBucket = normalizeForecastBucket(
		searchParams.get("forecastBucket"),
	);
	const activeForecastBucketLabel = getForecastBucketLabel(activeForecastBucket);
	const domainOptions = useMemo(
		() =>
			Array.from(
				new Map(
					summary.map((row) => [
						getDomainFilterValue(row.domain),
						row.domain?.trim() || "Unmapped",
					]),
				),
			).sort((left, right) =>
				left[1].localeCompare(right[1], undefined, { sensitivity: "base" }),
			),
		[summary],
	);
	const filteredSummary = useMemo(() => {
		if (!activeDomainFilter) {
			return summary;
		}

		return summary.filter(
			(row) => getDomainFilterValue(row.domain) === activeDomainFilter,
		);
	}, [activeDomainFilter, summary]);
	const activeDomainLabel = useMemo(
		() =>
			domainOptions.find(([value]) => value === activeDomainFilter)?.[1] ??
			null,
		[activeDomainFilter, domainOptions],
	);
	const canExportSelectedDomain =
		activeDomainFilter.length > 0 &&
		activeDomainFilter !== UNMAPPED_DOMAIN_FILTER &&
		(hasUnrestrictedDomainExportAccess ||
			exportableDomains.some(
				(domain) =>
					normalizeLookupValue(domain) ===
					normalizeLookupValue(activeDomainFilter),
			));
	const showExportControls = canExportSelectedDomain;
	const exportDomainHint = !activeDomainFilter
		? "Select a domain to export its underlying seat data."
		: activeDomainFilter === UNMAPPED_DOMAIN_FILTER
			? "Only mapped domains can be exported."
			: canExportSelectedDomain
				? `Exports all seat, actual, forecast, and roster data for ${activeDomainLabel || activeDomainFilter}.`
				: "Export requires access to all data in the selected domain.";

	const activeSeatSortField: SeatSortField | null =
		seatSortField === "seat" ||
		seatSortField === "resource" ||
		seatSortField === "type" ||
		seatSortField === "alloc"
			? seatSortField
			: null;

	const activeSeatSortDirection: SeatSortDirection =
		seatSortDirection === "desc" ? "desc" : "asc";
	const openSeatStatuses = useMemo(
		() =>
			new Set(
				statusDefinitions
					.map((definition) => (definition.label || "").trim().toLowerCase())
					.filter((label) => label === "open" || label.startsWith("open ")),
			),
		[statusDefinitions],
	);

	useEffect(() => {
		setActiveSummaryAreaId(initialSelectedAreaId);
		setAreaSeats(seats);
		setIsAreaLoading(Boolean(initialSelectedAreaId) && seats.length === 0);
	}, [initialSelectedAreaId, seats]);

	useEffect(() => {
		setOpenSeatsOnlyDraft(openSeatsOnly);
	}, [openSeatsOnly]);

	useEffect(() => {
		setShowCancelledSeatsDraft(showCancelledSeats);
	}, [showCancelledSeats]);

	useEffect(() => {
		if (!initialSelectedAreaId || seats.length > 0) {
			return;
		}

		let cancelled = false;
		setIsAreaLoading(true);

		void fetchJson(
			`/api/tracker/detail?year=${activeYear}&budgetAreaId=${encodeURIComponent(initialSelectedAreaId)}`,
		)
			.then((response) => {
				if (cancelled) {
					return;
				}

				setAreaSeats(response.seats);
			})
			.catch((error) => {
				if (cancelled) {
					return;
				}

				toast.error(
					error instanceof Error
						? error.message
						: "Failed to load pillar details",
				);
			})
			.finally(() => {
				if (!cancelled) {
					setIsAreaLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [activeYear, initialSelectedAreaId, seats]);

	const selectedArea =
		summary.find((row) => row.id === activeSummaryAreaId) ??
		filteredSummary[0] ??
		summary[0];
	const selectedAreaBucketBudgetDelta = useMemo(() => {
		return areaSeats.reduce(
			(totals, seat) => {
				if (isCloudSeatType(seat.resourceType)) {
					totals.cloudSpent += seat.totalSpent;
					return totals;
				}

				if ((seat.amsFte ?? 0) > 0 || isAmsSeatType(seat.resourceType)) {
					totals.amsSpent += seat.totalSpent;
					return totals;
				}

				if ((seat.extFte ?? 0) > 0) {
					totals.extSpent += seat.totalSpent;
					return totals;
				}

				if ((seat.permFte ?? 0) > 0) {
					totals.permSpent += seat.totalSpent;
				}

				return totals;
			},
			{
				permSpent: 0,
				extSpent: 0,
				amsSpent: 0,
				cloudSpent: 0,
			},
		);
	}, [areaSeats]);
	const effectiveSelectedAreaId =
		activeSummaryAreaId ?? selectedArea?.id ?? null;
	useEffect(() => {
		if (
			activeForecastBucket !== "cloud" ||
			!effectiveSelectedAreaId ||
			isAreaLoading ||
			areaSeats.some(
				(seat) => (seat.resourceType || "").trim().toLowerCase() === "cloud",
			)
		) {
			return;
		}

		let cancelled = false;
		setIsAreaLoading(true);

		void fetchJson(
			`/api/tracker/detail?year=${activeYear}&budgetAreaId=${encodeURIComponent(effectiveSelectedAreaId)}`,
		)
			.then((response) => {
				if (cancelled) {
					return;
				}

				setAreaSeats(response.seats);
			})
			.catch((error) => {
				if (cancelled) {
					return;
				}

				toast.error(
					error instanceof Error
						? error.message
						: "Failed to load cloud forecast seats",
				);
			})
			.finally(() => {
				if (!cancelled) {
					setIsAreaLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [
		activeForecastBucket,
		activeYear,
		areaSeats,
		effectiveSelectedAreaId,
		isAreaLoading,
	]);
	const filteredSeats = useMemo(() => {
		const teamFilter = new Set(
			trackerTeamFilters
				.map((team) => (team || "").trim().toLowerCase())
				.filter(Boolean),
		);
		const monthFilter = new Set(
			missingActualMonthFilters
				.map((month) => MONTH_NAMES.indexOf(month as MonthName))
				.filter((index) => index >= 0),
		);

		return areaSeats.filter((seat) => {
			if (!showCancelledSeats && isCancelledSeatStatus(seat.status)) {
				return false;
			}

			if (
				activeForecastBucket === "cloud" &&
				(seat.resourceType || "").trim().toLowerCase() !== "cloud"
			) {
				return false;
			}

			if (activeForecastBucket === "ext" && (seat.extFte ?? 0) <= 0) {
				return false;
			}

			if (
				activeForecastBucket === "ams" &&
				(seat.amsFte ?? 0) <= 0 &&
				!isAmsSeatType(seat.resourceType)
			) {
				return false;
			}

			if (activeForecastBucket === "perm" && (seat.permFte ?? 0) <= 0) {
				return false;
			}

			if (openSeatsOnly && !isOpenSeatStatus(seat.status, openSeatStatuses)) {
				return false;
			}

			if (
				teamFilter.size > 0 &&
				!teamFilter.has((seat.team || "").trim().toLowerCase())
			) {
				return false;
			}

			if (monthFilter.size > 0) {
				if (isOpenSeatStatus(seat.status, openSeatStatuses)) {
					return false;
				}

				const seatStartMonthIndex = getSeatStartMonthIndex(seat, activeYear);
				const eligibleMonthIndexes = Array.from(monthFilter).filter(
					(monthIndex) =>
						seatStartMonthIndex === null || monthIndex >= seatStartMonthIndex,
				);

				if (eligibleMonthIndexes.length === 0) {
					return false;
				}

				const hasMissingActualInSelectedMonth = eligibleMonthIndexes.some(
					(monthIndex) => {
						const month = seat.months.find(
							(entry) => entry.monthIndex === monthIndex,
						);
						const actualAmount =
							month?.actualAmountRaw ?? month?.actualAmountDkk ?? 0;

						return actualAmount <= 0;
					},
				);

				if (!hasMissingActualInSelectedMonth) {
					return false;
				}
			}

			return true;
		});
	}, [
		activeYear,
		activeForecastBucket,
		areaSeats,
		missingActualMonthFilters,
		openSeatsOnly,
		openSeatStatuses,
		trackerTeamFilters,
	]);
	const sortedSeats = useMemo(() => {
		if (!activeSeatSortField) {
			return filteredSeats;
		}

		const sorted = [...filteredSeats];
		const factor = activeSeatSortDirection === "asc" ? 1 : -1;
		const compareText = (
			left: string | null | undefined,
			right: string | null | undefined,
		) =>
			(left || "").localeCompare(right || "", undefined, {
				sensitivity: "base",
			});

		sorted.sort((left, right) => {
			if (activeSeatSortField === "alloc") {
				return (left.allocation - right.allocation) * factor;
			}

			const result =
				activeSeatSortField === "seat"
					? compareText(left.seatId, right.seatId)
					: activeSeatSortField === "resource"
						? compareText(left.inSeat, right.inSeat) ||
							compareText(left.band, right.band)
						: compareText(left.resourceType, right.resourceType) ||
							compareText(
								left.startDate ? String(left.startDate) : "",
								right.startDate ? String(right.startDate) : "",
							);

			if (result !== 0) {
				return result * factor;
			}

			return compareText(left.seatId, right.seatId) * factor;
		});

		return sorted;
	}, [activeSeatSortDirection, activeSeatSortField, filteredSeats]);

	useEffect(() => {
		if (
			!selectedSeatId ||
			!sortedSeats.some((seat) => seat.id === selectedSeatId)
		) {
			setSelectedSeatId(sortedSeats[0]?.id ?? "");
		}
	}, [selectedSeatId, sortedSeats]);

	const selectedSeat =
		sortedSeats.find((seat) => seat.id === selectedSeatId) ?? sortedSeats[0];
	const detailDialogSeat =
		sortedSeats.find((seat) => seat.id === detailDialogSeatId) ?? selectedSeat;
	const listedSeatTotals = useMemo(
		() =>
			sortedSeats.reduce(
				(totals, seat) => ({
					spent: totals.spent + seat.totalSpent,
					remainingForecast:
						totals.remainingForecast +
						Math.max(0, seat.totalForecast - seat.totalSpent),
					yearEndSpent: totals.yearEndSpent + seat.totalForecast,
				}),
				{
					spent: 0,
					remainingForecast: 0,
					yearEndSpent: 0,
				},
			),
		[sortedSeats],
	);
	const listedSeatFteTotals = useMemo(() => {
		const getSeatFte = (seat: SeatRow) => {
			if (
				isCloudSeatType(seat.resourceType) ||
				isLicenseSeatType(seat.resourceType)
			) {
				return 0;
			}

			return Number.isFinite(seat.allocation) ? seat.allocation : 0;
		};

		return {
			listed: sortedSeats.reduce((sum, seat) => sum + getSeatFte(seat), 0),
			total: areaSeats.reduce((sum, seat) => sum + getSeatFte(seat), 0),
		};
	}, [areaSeats, sortedSeats]);
	const effectiveTrackerTeamOptions = useMemo(
		() =>
			trackerTeamOptions.length > 0
				? trackerTeamOptions
				: Array.from(
						new Set(
							areaSeats
								.map((seat) => seat.team?.trim())
								.filter((team): team is string => Boolean(team)),
						),
					).sort((left, right) =>
						left.localeCompare(right, undefined, { sensitivity: "base" }),
					),
		[areaSeats, trackerTeamOptions],
	);

	function selectSeat(seatId: string) {
		setSelectedSeatId(seatId);
	}

	function openDetailDialog(seatId: string) {
		selectSeat(seatId);
		setDetailDialogSeatId(seatId);
	}

	function updateSeatSort(field: SeatSortField) {
		const nextDirection =
			activeSeatSortField === field && activeSeatSortDirection === "asc"
				? "desc"
				: "asc";

		updateParams({
			seatSortField: field,
			seatSortDirection: nextDirection,
		});
	}

	function sortIndicator(field: SeatSortField) {
		if (activeSeatSortField !== field) {
			return "↕";
		}

		return activeSeatSortDirection === "asc" ? "↑" : "↓";
	}

	const trackerTableHeadClassName =
		"sticky top-0 z-20 border-b border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85";

	function updateParams(next: Record<string, string | null>) {
		const params = new URLSearchParams(searchParams.toString());
		Object.entries(next).forEach(([key, value]) => {
			if (!value) {
				params.delete(key);
			} else {
				params.set(key, value);
			}
		});

		startTransition(() => {
			router.replace(`/tracker?${params.toString()}`, { scroll: false });
		});
	}

	function toggleForecastBucket(bucket: ForecastBucket) {
		updateParams({
			forecastBucket: activeForecastBucket === bucket ? null : bucket,
		});
	}

	function handleSeatTrackerFilterSubmit(
		event: React.FormEvent<HTMLFormElement>,
	) {
		event.preventDefault();

		const formData = new FormData(event.currentTarget);
		const params = new URLSearchParams();
		const appendValues = (key: string, values: FormDataEntryValue[]) => {
			values
				.map((value) => String(value).trim())
				.filter(Boolean)
				.forEach((value) => {
					params.append(key, value);
				});
		};

		const year = String(formData.get("year") || "").trim();
		const domain = String(formData.get("domain") || "").trim();
		const budgetAreaId = String(formData.get("budgetAreaId") || "").trim();
		const seatSortField = String(formData.get("seatSortField") || "").trim();
		const seatSortDirection = String(
			formData.get("seatSortDirection") || "",
		).trim();

		if (year) {
			params.set("year", year);
		}

		if (domain) {
			params.set("domain", domain);
		}

		if (budgetAreaId) {
			params.set("budgetAreaId", budgetAreaId);
		}

		if (seatSortField) {
			params.set("seatSortField", seatSortField);
		}

		if (seatSortDirection) {
			params.set("seatSortDirection", seatSortDirection);
		}

		if (activeForecastBucket) {
			params.set("forecastBucket", activeForecastBucket);
		}

		appendValues("team", formData.getAll("team"));
		appendValues("missingActualMonth", formData.getAll("missingActualMonth"));
		if (formData.get("openSeatsOnly") === "true") {
			params.set("openSeatsOnly", "true");
		}
		if (formData.get("showCancelledSeats") === "true") {
			params.set("showCancelledSeats", "true");
		}

		startTransition(() => {
			router.replace(`/tracker?${params.toString()}`, { scroll: false });
		});
	}

	function handleOpenSeatsOnlyChange(checked: boolean) {
		setOpenSeatsOnlyDraft(checked);

		const form = seatFilterFormRef.current;
		if (!form) {
			return;
		}

		requestAnimationFrame(() => {
			form.requestSubmit();
		});
	}

	function handleShowCancelledSeatsChange(checked: boolean) {
		setShowCancelledSeatsDraft(checked);

		const form = seatFilterFormRef.current;
		if (!form) {
			return;
		}

		requestAnimationFrame(() => {
			form.requestSubmit();
		});
	}

	async function handleAreaSelection(areaId: string) {
		await handleAreaSelectionWithParams(
			areaId,
			new URLSearchParams(searchParams.toString()),
		);
	}

	async function handleAreaSelectionWithParams(
		areaId: string,
		params: URLSearchParams,
	) {
		if (areaId === effectiveSelectedAreaId) {
			return;
		}

		params.set("budgetAreaId", areaId);
		params.delete("team");
		params.delete("missingActualMonth");
		params.delete("openSeatsOnly");

		setActiveSummaryAreaId(areaId);
		setAreaSeats([]);
		setSelectedSeatId("");
		setOpenSeatsOnlyDraft(false);
		setIsAreaLoading(true);

		startTransition(() => {
			router.replace(`/tracker?${params.toString()}`, { scroll: false });
		});

		try {
			const response = await fetchJson(
				`/api/tracker/detail?year=${activeYear}&budgetAreaId=${encodeURIComponent(areaId)}`,
			);
			setAreaSeats(response.seats);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to load pillar details",
			);
			setActiveSummaryAreaId(initialSelectedAreaId);
			setAreaSeats(seats);
		} finally {
			setIsAreaLoading(false);
		}
	}

	function handleDomainFilterChange(nextDomainFilter: string) {
		const params = new URLSearchParams(searchParams.toString());

		if (nextDomainFilter) {
			params.set("domain", nextDomainFilter);
		} else {
			params.delete("domain");
		}

		const nextSummary = nextDomainFilter
			? summary.filter(
					(row) => getDomainFilterValue(row.domain) === nextDomainFilter,
				)
			: summary;
		const currentSelectionStillVisible = nextSummary.some(
			(row) => row.id === effectiveSelectedAreaId,
		);

		if (currentSelectionStillVisible || !nextSummary[0]) {
			startTransition(() => {
				router.replace(`/tracker?${params.toString()}`, { scroll: false });
			});
			return;
		}

		void handleAreaSelectionWithParams(nextSummary[0].id, params);
	}

	function downloadCsv(fileName: string, content: string) {
		const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = fileName;
		link.click();
		URL.revokeObjectURL(url);
	}

	async function handleExportDomainCsv() {
		if (!canExportSelectedDomain || !activeDomainFilter) {
			return;
		}

		setIsExportingDomainCsv(true);

		try {
			const response = await fetch(
				`/api/tracker/export?year=${activeYear}&domain=${encodeURIComponent(activeDomainFilter)}`,
			);

			if (!response.ok) {
				const body = await response.json();
				throw new Error(body.error || "Export failed");
			}

			const safeDomainName = (activeDomainLabel || activeDomainFilter)
				.trim()
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-+|-+$/g, "");

			downloadCsv(
				`tracker-domain-${safeDomainName || "export"}-${activeYear}.csv`,
				await response.text(),
			);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Export failed");
		} finally {
			setIsExportingDomainCsv(false);
		}
	}

	return (
		<main className="mx-auto flex w-full max-w-7xl flex-col gap-6 py-1">
			<FinancePageIntro
				title="Financial Tracker"
				subtitle="Imported budget movements, roster-derived seats, and manual finance assumptions."
			/>
			<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<Card className="brand-stat-card">
					<CardHeader className="gap-1 p-5">
						<CardDescription className="text-sm text-muted-foreground">
							Total Budget
						</CardDescription>
						<CardTitle className="text-[2.05rem] font-semibold tracking-tight">
							{formatCurrency(summaryTotals.amountGivenBudget)}
						</CardTitle>
						<div className="text-xs text-muted-foreground">
							Finance view {formatCurrency(summaryTotals.financeViewBudget)}
						</div>
					</CardHeader>
				</Card>
				<Card className="brand-stat-card">
					<CardHeader className="gap-1 p-5">
						<CardDescription className="text-sm text-muted-foreground">
							Spent to date
						</CardDescription>
						<CardTitle className="text-[2.05rem] font-semibold tracking-tight">
							{formatCurrency(summaryTotals.spent)}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card className="brand-stat-card">
					<CardHeader className="gap-1 p-5">
						<CardDescription className="text-sm text-muted-foreground">
							Total Forecast
						</CardDescription>
						<CardTitle className="text-[2.05rem] font-semibold tracking-tight">
							{formatCurrency(summaryTotals.forecast)}
						</CardTitle>
					</CardHeader>
				</Card>
				<Card className="brand-stat-card">
					<CardHeader className="gap-1 p-5">
						<CardDescription className="text-sm text-muted-foreground">
							Tracked Seats
						</CardDescription>
						<CardTitle className="text-[2.05rem] font-semibold tracking-tight">
							{formatNumber(summaryTotals.seatCount)}
						</CardTitle>
					</CardHeader>
				</Card>
			</section>

			<section className="space-y-6">
				<Card className="brand-panel overflow-hidden">
					<CardHeader className="flex-col items-start justify-between gap-5 border-b border-border/60 pb-5 lg:flex-row lg:items-end">
						<div>
							<CardTitle className="text-[1.7rem] font-semibold tracking-tight">
								Budget Summary
							</CardTitle>
							<CardDescription className="mt-1">
								Imported budget movements plus derived spend and forecast by
								pillar.
							</CardDescription>
							<div className="mt-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
								All values in DKK
							</div>
						</div>

						<div className="flex w-full flex-col gap-3 lg:max-w-4xl lg:self-end">
							<div className="flex w-full flex-wrap items-center justify-between gap-4">
								<div className="flex flex-wrap items-center gap-6">
									<div className="flex items-center gap-3">
										<Label
											htmlFor="year-select"
											className="text-xs uppercase tracking-[0.18em] text-muted-foreground"
										>
											Year
										</Label>
										<select
											id="year-select"
											className="h-10 rounded-xl border border-border bg-background/80 px-4 text-sm"
											value={String(activeYear)}
											onChange={(event) =>
												updateParams({ year: event.target.value })
											}
										>
											{trackingYears.map((year) => (
												<option key={year.id} value={year.year}>
													{year.year}
												</option>
											))}
											{!trackingYears.some(
												(year) => year.year === activeYear,
											) ? (
												<option value={activeYear}>{activeYear}</option>
											) : null}
										</select>
									</div>
									<div className="flex items-center gap-3">
										<Label
											htmlFor="domain-select"
											className="text-xs uppercase tracking-[0.18em] text-muted-foreground"
										>
											Domain
										</Label>
										<select
											id="domain-select"
											className="h-10 rounded-xl border border-border bg-background/80 px-4 text-sm"
											value={activeDomainFilter}
											onChange={(event) =>
												handleDomainFilterChange(event.target.value)
											}
										>
											<option value="">All domains</option>
											{domainOptions.map(([value, label]) => (
												<option key={value} value={value}>
													{label}
												</option>
											))}
										</select>
									</div>
								</div>
								<div className="flex-1" />
								{showExportControls ? (
									<div className="ml-auto flex flex-wrap items-center justify-end gap-3">
										<div className="hidden max-w-64 text-right text-xs text-muted-foreground xl:block">
											{exportDomainHint}
										</div>
										<Button
											type="button"
											variant="outline"
											onClick={() => void handleExportDomainCsv()}
											disabled={isExportingDomainCsv}
										>
											<Download className="mr-2 h-4 w-4" />
											{isExportingDomainCsv ? "Exporting..." : "Export CSV"}
										</Button>
									</div>
								) : null}
							</div>
							{showExportControls ? (
								<div className="w-full text-xs text-muted-foreground xl:hidden lg:text-right">
									{exportDomainHint}
								</div>
							) : null}
						</div>
					</CardHeader>
					<CardContent className="pt-5">
						<div className="brand-table-shell">
							<Table className="min-w-[1080px]">
								<TableHeader>
									<TableRow>
										<TableHead className="h-14 w-[31rem] bg-muted/30 text-sm font-medium">
											Pillar
										</TableHead>
										<TableHead className="h-14 w-[12rem] bg-muted/30 text-right text-sm font-medium">
											Budget
										</TableHead>
										<TableHead className="h-14 w-[10rem] bg-muted/30 text-right text-sm font-medium whitespace-normal leading-tight">
											<span className="block">Spent To</span>
											<span className="block">Date</span>
										</TableHead>
										<TableHead className="h-14 w-[11rem] bg-muted/30 text-right text-sm font-medium whitespace-normal leading-tight">
											<span className="block">Remaining</span>
											<span className="block">Budget</span>
										</TableHead>
										<TableHead className="h-14 w-[12rem] bg-muted/30 text-right text-sm font-medium whitespace-normal leading-tight">
											<span className="block">Forecast Spent</span>
											<span className="block">To End Of Year</span>
										</TableHead>
										<TableHead className="h-14 w-[11rem] bg-muted/30 text-right text-sm font-medium whitespace-normal leading-tight">
											<span className="block">End Of Year</span>
											<span className="block">Balance</span>
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{filteredSummary.map((row) => {
										const remainingBudget =
											row.amountGivenBudget - row.spentToDate;
										const forecastSpentToEndOfYear =
											row.totalForecast - row.spentToDate;
										const endOfYearBalance =
											remainingBudget - forecastSpentToEndOfYear;

										return (
											<TableRow
												key={row.id}
												tabIndex={0}
												className={cn(
													"cursor-pointer transition-colors focus-visible:outline-none brand-hover-row",
													row.id === effectiveSelectedAreaId &&
														"brand-selected-row",
												)}
												onClick={() => void handleAreaSelection(row.id)}
												onKeyDown={(event) => {
													if (event.key === "Enter" || event.key === " ") {
														event.preventDefault();
														void handleAreaSelection(row.id);
													}
												}}
											>
												<TableCell className="align-top whitespace-normal">
													<div className="font-medium">{row.displayName}</div>
													<div className="text-xs text-muted-foreground">
														{row.domain || "Unmapped domain"} ·{" "}
														{row.subDomain || "Unmapped sub-domain"}
													</div>
													<div className="mt-1 text-xs text-muted-foreground/80">
														Project {row.projectCode || "Unassigned"}
													</div>
												</TableCell>
												<TableCell className="align-top text-right whitespace-nowrap">
													<div className="font-medium">
														{formatBudgetSummaryAmount(row.amountGivenBudget)}
													</div>
													<div className="text-xs text-muted-foreground">
														Finance view {formatBudgetSummaryAmount(row.financeViewBudget)}
													</div>
												</TableCell>
												<TableCell
													className={cn(
														"align-top text-right whitespace-nowrap",
														row.spentToDate < 0 && "text-rose-600",
													)}
												>
													{formatBudgetSummaryAmount(row.spentToDate)}
												</TableCell>
												<TableCell
													className={cn(
														"align-top text-right whitespace-nowrap",
														remainingBudget < 0 && "text-rose-600",
													)}
												>
													{formatBudgetSummaryAmount(remainingBudget)}
												</TableCell>
												<TableCell
													className={cn(
														"align-top text-right whitespace-nowrap",
														forecastSpentToEndOfYear < 0 && "text-rose-600",
													)}
												>
													{formatBudgetSummaryAmount(forecastSpentToEndOfYear)}
												</TableCell>
												<TableCell
													className={cn(
														"align-top text-right whitespace-nowrap",
														endOfYearBalance < 0 && "text-rose-600",
													)}
												>
													{formatBudgetSummaryAmount(endOfYearBalance)}
												</TableCell>
											</TableRow>
										);
									})}
									{filteredSummary.length === 0 ? (
										<TableRow>
											<TableCell
												colSpan={6}
												className="py-8 text-center text-muted-foreground"
											>
												{activeDomainFilter
													? "No pillars found for the selected domain."
													: "Import budget movements and roster data to populate the tracker."}
											</TableCell>
										</TableRow>
									) : null}
								</TableBody>
							</Table>
						</div>
					</CardContent>
				</Card>

				<Card className="brand-panel">
					<CardHeader className="border-b border-border/60 pb-5">
						<CardTitle className="text-[1.7rem] font-semibold tracking-tight">
							Selected Pillar
						</CardTitle>
						<CardDescription>
							{selectedArea
								? `${selectedArea.displayName} for ${activeYear}`
								: `No pillar selected for ${activeYear}`}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4 text-sm">
						{selectedArea ? (
							<>
								<div className="grid gap-3 md:grid-cols-5">
									<div className="rounded-2xl bg-muted/45 p-4">
										<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
											Domain
										</div>
										<div className="mt-2 text-base font-semibold">
											{selectedArea.domain || "Unmapped"}
										</div>
									</div>
									<div className="rounded-2xl bg-muted/45 p-4">
										<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
											Sub-domain
										</div>
										<div className="mt-2 text-base font-semibold">
											{selectedArea.subDomain || "Unmapped"}
										</div>
									</div>
									<div className="rounded-2xl bg-muted/45 p-4">
										<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
											Project Code
										</div>
										<div className="mt-2 text-base font-semibold">
											{selectedArea.projectCode || "Unassigned"}
										</div>
									</div>
									<div className="rounded-2xl bg-muted/45 p-4">
										<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
											PERM Target (FTE)
										</div>
										<div className="mt-2 text-base font-semibold">
											{formatNumber(selectedArea.permTarget)}
										</div>
									</div>
									<div className="rounded-2xl bg-muted/45 p-4">
										<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
											Cloud Target
										</div>
										<div className="mt-2 text-base font-semibold">
											{formatCurrency(selectedArea.cloudCostTarget)}
										</div>
									</div>
								</div>
								<div className="grid gap-3 border-t border-border/60 pt-5 md:grid-cols-4">
									<button
										type="button"
										onClick={() => toggleForecastBucket("perm")}
										className={cn(
											"rounded-2xl border border-dashed border-border px-4 py-4 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2",
											activeForecastBucket === "perm" &&
												"border-rose-300 bg-rose-50/60",
										)}
									>
										<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
											PERM Forecast
										</div>
										<div className="mt-2 font-medium">
											{formatCurrency(selectedArea.permForecast)}
										</div>
										<div className="mt-2 text-xs text-muted-foreground">
											{activeForecastBucket === "perm"
												? "Showing below. Click again to clear."
												: "Click to filter the seat tracker below."}
										</div>
									</button>
									<button
										type="button"
										onClick={() => toggleForecastBucket("ext")}
										className={cn(
											"rounded-2xl border border-dashed border-border px-4 py-4 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2",
											activeForecastBucket === "ext" &&
												"border-rose-300 bg-rose-50/60",
										)}
									>
										<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
											EXT Forecast
										</div>
										<div className="mt-2 font-medium">
											{formatCurrency(selectedArea.extForecast)}
										</div>
										<div className="mt-2 text-xs text-muted-foreground">
											{activeForecastBucket === "ext"
												? "Showing below. Click again to clear."
												: "Click to filter the seat tracker below."}
										</div>
									</button>
									<button
										type="button"
										onClick={() => toggleForecastBucket("ams")}
										className={cn(
											"rounded-2xl border border-dashed border-border px-4 py-4 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2",
											activeForecastBucket === "ams" &&
												"border-rose-300 bg-rose-50/60",
										)}
									>
										<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
											AMS Forecast
										</div>
										<div className="mt-2 font-medium">
											{formatCurrency(selectedArea.amsForecast)}
										</div>
										<div className="mt-2 text-xs text-muted-foreground">
											{activeForecastBucket === "ams"
												? "Showing below. Click again to clear."
												: "Click to filter the seat tracker below."}
										</div>
									</button>
									<button
										type="button"
										onClick={() => toggleForecastBucket("cloud")}
										className={cn(
											"rounded-2xl border border-dashed border-border px-4 py-4 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2",
											activeForecastBucket === "cloud" &&
												"border-rose-300 bg-rose-50/60",
										)}
									>
										<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
											Cloud Forecast
										</div>
										<div className="mt-2 font-medium">
											{formatCurrency(selectedArea.cloudCostForecast)}
										</div>
										<div className="mt-2 text-xs text-muted-foreground">
											{activeForecastBucket === "cloud"
												? "Showing below. Click again to clear."
												: "Click to filter the seat tracker below."}
										</div>
									</button>
								</div>
								<div className="grid gap-3 md:grid-cols-4">
									<div className="rounded-2xl bg-muted/35 px-4 py-4">
										<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
											PERM Budget - Spent
										</div>
										<div className="mt-2 font-medium">
											{formatCurrency(
												selectedArea.permBudget -
													selectedAreaBucketBudgetDelta.permSpent,
											)}
										</div>
									</div>
									<div className="rounded-2xl bg-muted/35 px-4 py-4">
										<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
											EXT Budget - Spent
										</div>
										<div className="mt-2 font-medium">
											{formatCurrency(
												selectedArea.extBudget -
													selectedAreaBucketBudgetDelta.extSpent,
											)}
										</div>
									</div>
									<div className="rounded-2xl bg-muted/35 px-4 py-4">
										<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
											AMS Budget - Spent
										</div>
										<div className="mt-2 font-medium">
											{formatCurrency(
												selectedArea.amsBudget -
													selectedAreaBucketBudgetDelta.amsSpent,
											)}
										</div>
									</div>
									<div className="rounded-2xl bg-muted/35 px-4 py-4">
										<div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
											Cloud Budget - Spent
										</div>
										<div className="mt-2 font-medium">
											{formatCurrency(
												selectedArea.cloudCostTarget -
													selectedAreaBucketBudgetDelta.cloudSpent,
											)}
										</div>
									</div>
								</div>
								<div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl bg-muted/30 px-4 py-3">
									<div className="flex items-center gap-2">
										<span className="text-muted-foreground">Spent</span>
										<span className="font-medium">
											{formatCurrency(selectedArea.spentToDate)}
										</span>
									</div>
									<div className="flex items-center gap-2">
										<span className="text-muted-foreground">Budget</span>
										<span className="font-medium">
											{formatCurrency(selectedArea.amountGivenBudget)}
										</span>
									</div>
									<div className="flex items-center gap-2">
										<span className="text-muted-foreground">Remaining</span>
										<span className="font-medium">
											{formatCurrency(selectedArea.forecastRemaining)}
										</span>
									</div>
								</div>
							</>
						) : (
							<p className="text-muted-foreground">
								Choose a pillar in the summary table to inspect seats and
								forecast details.
							</p>
						)}
					</CardContent>
				</Card>
			</section>

			<section className="grid gap-6">
				<Card className="brand-panel min-w-0">
					<CardHeader className="border-b border-border/60 pb-5">
						<CardTitle className="text-[1.55rem] font-semibold tracking-tight">
							Seat Tracker
						</CardTitle>
						<CardDescription>
							{isAreaLoading
								? "Loading pillar details..."
								: activeForecastBucketLabel
									? `Filtered to ${activeForecastBucketLabel.toLowerCase()} for the selected pillar.`
									: "Detail rows derived from the latest approved roster import."}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form
							method="GET"
							className="mb-5 grid gap-4 lg:grid-cols-[1fr_1fr_auto]"
							onSubmit={handleSeatTrackerFilterSubmit}
							ref={seatFilterFormRef}
						>
							<input type="hidden" name="year" value={String(activeYear)} />
							{activeDomainFilter ? (
								<input type="hidden" name="domain" value={activeDomainFilter} />
							) : null}
							{effectiveSelectedAreaId ? (
								<input
									type="hidden"
									name="budgetAreaId"
									value={effectiveSelectedAreaId}
								/>
							) : null}
							{activeSeatSortField ? (
								<input
									type="hidden"
									name="seatSortField"
									value={activeSeatSortField}
								/>
							) : null}
							<input
								type="hidden"
								name="seatSortDirection"
								value={activeSeatSortDirection}
							/>
							{activeForecastBucket ? (
								<input
									type="hidden"
									name="forecastBucket"
									value={activeForecastBucket}
								/>
							) : null}
							<MultiSelectFilter
								label="Team"
								name="team"
								options={effectiveTrackerTeamOptions}
								selectedValues={trackerTeamFilters}
							/>
							<MultiSelectFilter
								label="Missing Actual Month"
								name="missingActualMonth"
								options={missingActualMonthOptions}
								selectedValues={missingActualMonthFilters}
							/>
							<div className="flex items-end">
								<div className="flex w-full items-center justify-between rounded-2xl border border-border/70 bg-background/75 px-4 py-3">
									<div className="pr-4">
										<div className="text-sm font-medium">Open seats only</div>
										<div className="text-xs text-muted-foreground">
											Limit the list to seats with status Open.
										</div>
									</div>
									<div className="flex items-center gap-3">
										{openSeatsOnlyDraft ? (
											<input type="hidden" name="openSeatsOnly" value="true" />
										) : null}
										<Switch
											checked={openSeatsOnlyDraft}
											onCheckedChange={handleOpenSeatsOnlyChange}
										/>
									</div>
								</div>
							</div>
							<div className="flex items-end">
								<div className="flex w-full items-center justify-between rounded-2xl border border-border/70 bg-background/75 px-4 py-3">
									<div className="pr-4">
										<div className="text-sm font-medium">
											Show cancelled seats
										</div>
										<div className="text-xs text-muted-foreground">
											Hidden by default to keep the tracker focused on active work.
										</div>
									</div>
									<div className="flex items-center gap-3">
										{showCancelledSeatsDraft ? (
											<input
												type="hidden"
												name="showCancelledSeats"
												value="true"
											/>
										) : null}
										<Switch
											checked={showCancelledSeatsDraft}
											onCheckedChange={handleShowCancelledSeatsChange}
										/>
									</div>
								</div>
							</div>
							<div className="flex items-end gap-2">
								<Button type="submit">Apply</Button>
								<Button asChild variant="outline">
									<Link
										href={
											effectiveSelectedAreaId
												? `/tracker?year=${activeYear}${activeDomainFilter ? `&domain=${encodeURIComponent(activeDomainFilter)}` : ""}&budgetAreaId=${encodeURIComponent(effectiveSelectedAreaId)}`
												: `/tracker?year=${activeYear}${activeDomainFilter ? `&domain=${encodeURIComponent(activeDomainFilter)}` : ""}`
										}
									>
										Reset
									</Link>
								</Button>
							</div>
						</form>
						{activeForecastBucketLabel ? (
							<div className="mb-4 rounded-2xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
								Showing {activeForecastBucketLabel.toLowerCase()} in the seat tracker.
							</div>
						) : null}
						<div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl bg-muted/30 px-4 py-3 text-sm">
							<div className="flex items-center gap-2">
								<span className="text-muted-foreground">Listed spent</span>
								<span className="font-medium">
									{formatCurrency(listedSeatTotals.spent)}
								</span>
							</div>
							<div className="flex items-center gap-2">
								<span className="text-muted-foreground">Listed remaining forecast</span>
								<span className="font-medium">
									{formatCurrency(listedSeatTotals.remainingForecast)}
								</span>
							</div>
							<div className="flex items-center gap-2">
								<span className="text-muted-foreground">Listed year end spent</span>
								<span className="font-medium">
									{formatCurrency(listedSeatTotals.yearEndSpent)}
								</span>
							</div>
							<div className="flex items-center gap-2">
								<span className="text-muted-foreground">Showing</span>
								<span className="font-medium">
									{formatNumber(sortedSeats.length)} of{" "}
									{formatNumber(areaSeats.length)} seats
								</span>
							</div>
							<div className="flex items-center gap-2">
								<span className="text-muted-foreground">Showing</span>
								<span className="font-medium">
									{formatNumber(listedSeatFteTotals.listed)} of{" "}
									{formatNumber(listedSeatFteTotals.total)} FTE
								</span>
							</div>
						</div>
						<div className="brand-table-shell">
							<div
								className="overflow-auto"
								style={{ height: "max(20rem, calc(100dvh - 24rem))" }}
							>
							<Table containerClassName="overflow-visible">
								<TableHeader>
									<TableRow>
										<TableHead className={trackerTableHeadClassName}>
											<button
												type="button"
												className="text-left hover:text-foreground"
												onClick={() => updateSeatSort("seat")}
											>
												Seat {sortIndicator("seat")}
											</button>
										</TableHead>
										<TableHead className={trackerTableHeadClassName}>
											<button
												type="button"
												className="text-left hover:text-foreground"
												onClick={() => updateSeatSort("resource")}
											>
												Resource {sortIndicator("resource")}
											</button>
										</TableHead>
										<TableHead className={trackerTableHeadClassName}>
											<button
												type="button"
												className="text-left hover:text-foreground"
												onClick={() => updateSeatSort("type")}
											>
												Type {sortIndicator("type")}
											</button>
										</TableHead>
										<TableHead className={trackerTableHeadClassName}>
											<button
												type="button"
												className="text-left hover:text-foreground"
												onClick={() => updateSeatSort("alloc")}
											>
												Alloc {sortIndicator("alloc")}
											</button>
										</TableHead>
										<TableHead className={trackerTableHeadClassName}>
											<button
												type="button"
												className="text-left hover:text-foreground"
												onClick={() =>
													setShowSpentQuarterly((current) => !current)
												}
											>
												Spent {showSpentQuarterly ? "−" : "+"}
											</button>
										</TableHead>
										{showSpentQuarterly ? (
											<>
												<TableHead className={trackerTableHeadClassName}>S Q1</TableHead>
												<TableHead className={trackerTableHeadClassName}>S Q2</TableHead>
												<TableHead className={trackerTableHeadClassName}>S Q3</TableHead>
												<TableHead className={trackerTableHeadClassName}>S Q4</TableHead>
											</>
										) : null}
										<TableHead className={trackerTableHeadClassName}>
											<button
												type="button"
												className="text-left hover:text-foreground"
												onClick={() =>
													setShowForecastQuarterly((current) => !current)
												}
											>
												Remaining Forecast {showForecastQuarterly ? "−" : "+"}
											</button>
										</TableHead>
										{showForecastQuarterly ? (
											<>
												<TableHead className={trackerTableHeadClassName}>F Q1</TableHead>
												<TableHead className={trackerTableHeadClassName}>F Q2</TableHead>
												<TableHead className={trackerTableHeadClassName}>F Q3</TableHead>
												<TableHead className={trackerTableHeadClassName}>F Q4</TableHead>
											</>
										) : null}
										<TableHead className={trackerTableHeadClassName}>
											Year End Spent
										</TableHead>
										<TableHead
											className={cn(
												trackerTableHeadClassName,
												"w-28 text-right align-top",
											)}
										>
											Actions
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{sortedSeats.map((seat) =>
										(() => {
											const quarterlySpent = getQuarterlySpent(seat);
											const remainingForecast = Math.max(
												0,
												seat.totalForecast - seat.totalSpent,
											);
											const fullYearForecast = seat.months.reduce(
												(sum, month) =>
													sum + (month.comparisonForecastAmount ?? 0),
												0,
											);
											const yearEndSpentDeviation =
												seat.totalForecast - fullYearForecast;
											const quarterlyForecast = Array.from(
												{ length: 4 },
												(_, quarterIndex) =>
													sumQuarter(seat.monthlyForecast, quarterIndex),
											);

											return (
												<TableRow
													key={seat.id}
													className={
														seat.id === selectedSeatId
															? "brand-selected-row"
															: "cursor-pointer"
													}
													onClick={() => selectSeat(seat.id)}
												>
													<TableCell className="align-top whitespace-normal break-words">
														<div className="flex items-center justify-between gap-3">
															<Link
																href={`/people-roster?year=${activeYear}&seatId=${encodeURIComponent(seat.seatId)}`}
																className="brand-inline-link"
																onClick={(event) => event.stopPropagation()}
															>
																{seat.seatId}
															</Link>
															<Badge variant="outline">
																{seat.status || "No status"}
															</Badge>
														</div>
														<div className="text-xs text-muted-foreground">
															{seat.team}
														</div>
														<div className="text-xs text-muted-foreground">
															{seat.team || "No team"}
														</div>
														<div className="text-xs text-muted-foreground">
															{seat.projectCode || "No project code"}
														</div>
													</TableCell>
													<TableCell className="align-top whitespace-normal break-words">
														<div className="break-words whitespace-normal">
															{seat.inSeat || "Unassigned"}
														</div>
														<div className="text-xs text-muted-foreground">
															{seat.band}
														</div>
														<div className="text-xs text-muted-foreground">
															{seat.location || "No location"}
														</div>
													</TableCell>
													<TableCell className="align-top whitespace-normal break-words">
														<div className="break-words whitespace-normal">
															{seat.resourceType || "n/a"}
														</div>
														<div className="text-xs text-muted-foreground whitespace-normal break-words">
															{seat.description || "No role"}
														</div>
														<div className="text-xs text-muted-foreground whitespace-normal break-words">
															{formatOptionalDate(seat.startDate)} to{" "}
															{formatOptionalDate(seat.endDate)}
														</div>
													</TableCell>
													<TableCell>
														{formatPercent(seat.allocation)}
													</TableCell>
													<TableCell>
														{formatCurrency(seat.totalSpent)}
													</TableCell>
													{showSpentQuarterly ? (
														<>
															<TableCell>
																{formatCurrency(quarterlySpent[0])}
															</TableCell>
															<TableCell>
																{formatCurrency(quarterlySpent[1])}
															</TableCell>
															<TableCell>
																{formatCurrency(quarterlySpent[2])}
															</TableCell>
															<TableCell>
																{formatCurrency(quarterlySpent[3])}
															</TableCell>
														</>
													) : null}
													<TableCell className="align-top">
														<div className="flex items-center gap-1">
															<span>{formatCurrency(remainingForecast)}</span>
															{seat.hasForecastAdjustments ? (
																<PenLine
																	className="size-3.5 text-rose-700 dark:text-rose-300"
																	aria-label="Forecast contains manual adjustments"
																/>
															) : null}
														</div>
														<div className="max-w-48 whitespace-normal wrap-break-word text-xs leading-5 text-muted-foreground">
															{formatForecastCoverage(seat)}
														</div>
													</TableCell>
													{showForecastQuarterly ? (
														<>
															<TableCell>
																{formatCurrency(quarterlyForecast[0])}
															</TableCell>
															<TableCell>
																{formatCurrency(quarterlyForecast[1])}
															</TableCell>
															<TableCell>
																{formatCurrency(quarterlyForecast[2])}
															</TableCell>
															<TableCell>
																{formatCurrency(quarterlyForecast[3])}
															</TableCell>
														</>
													) : null}
													<TableCell>
														<div>{formatCurrency(seat.totalForecast)}</div>
														<div
															className={cn(
																"text-xs",
																yearEndSpentDeviation < 0
																	? "text-emerald-700/80"
																	: yearEndSpentDeviation > 0
																		? "text-rose-700/80"
																		: "text-muted-foreground",
															)}
														>
															vs full year {yearEndSpentDeviation > 0 ? "+" : ""}
															{formatCurrency(yearEndSpentDeviation)}
														</div>
													</TableCell>
													<TableCell className="align-top text-right">
														<div className="flex flex-col items-end gap-2">
															<Button
																type="button"
																variant="outline"
																size="icon-sm"
																aria-label={`View monthly detail for ${seat.seatId}`}
																onClick={(event) => {
																	event.stopPropagation();
																	openDetailDialog(seat.id);
																}}
															>
																<Eye className="size-4" />
															</Button>
														</div>
													</TableCell>
												</TableRow>
											);
										})(),
									)}
									{sortedSeats.length === 0 ? (
										<TableRow>
											<TableCell
												colSpan={
													8 +
													(showSpentQuarterly ? 4 : 0) +
													(showForecastQuarterly ? 4 : 0)
												}
												className="py-8 text-center text-muted-foreground"
											>
												No derived seats for this pillar yet.
											</TableCell>
										</TableRow>
									) : null}
								</TableBody>
							</Table>
							</div>
						</div>
					</CardContent>
				</Card>
			</section>

			<Dialog
				open={detailDialogSeatId !== null}
				onOpenChange={(open) => {
					if (!open) {
						setDetailDialogSeatId(null);
					}
				}}
			>
				<DialogContent className="max-h-[85vh] max-w-4xl overflow-hidden">
					<DialogHeader>
						<DialogTitle>Seat Monthly Detail</DialogTitle>
						<DialogDescription>
							Review monthly forecast and actuals for the selected seat.
						</DialogDescription>
					</DialogHeader>
					{detailDialogSeat ? (
						<div className="space-y-4 overflow-y-auto pr-1">
							<div className="rounded-2xl bg-muted/40 p-4 text-sm">
								<div className="font-medium">
									{detailDialogSeat.seatId} ·{" "}
									{detailDialogSeat.inSeat || "Unassigned"}
								</div>
								<div className="mt-1 text-muted-foreground">
									{detailDialogSeat.team || "No team"}
								</div>
								<div className="mt-1 text-muted-foreground">
									{detailDialogSeat.description || "No role"} ·{" "}
									{detailDialogSeat.band || "No band"}
								</div>
							</div>
							<div className="brand-table-shell overflow-x-auto">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Month</TableHead>
											<TableHead>Forecast</TableHead>
											<TableHead>Actual</TableHead>
											<TableHead>Raw</TableHead>
											<TableHead>Forecast On</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{MONTH_NAMES.map((month, monthIndex) => {
											const monthEntry = detailDialogSeat.months.find(
												(entry) => entry.monthIndex === monthIndex,
											);
											return (
												<TableRow key={month}>
													<TableCell>{month}</TableCell>
													<TableCell>
														{formatCurrency(
															detailDialogSeat.monthlyForecast[monthIndex] ?? 0,
														)}
													</TableCell>
													<TableCell>
														{formatCurrency(monthEntry?.actualAmountDkk ?? 0)}
													</TableCell>
													<TableCell className="text-xs text-muted-foreground">
														{monthEntry?.actualAmountRaw ?? 0}{" "}
														{monthEntry?.actualCurrency || "DKK"}
													</TableCell>
													<TableCell>
														{monthEntry?.forecastIncluded === false
															? "No"
															: "Yes"}
													</TableCell>
												</TableRow>
											);
										})}
									</TableBody>
								</Table>
							</div>
							<div className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm">
								<div className="flex items-center justify-between">
									<span className="text-muted-foreground">Start</span>
									<span>{formatOptionalDate(detailDialogSeat.startDate)}</span>
								</div>
								<div className="mt-2 flex items-center justify-between">
									<span className="text-muted-foreground">End</span>
									<span>{formatOptionalDate(detailDialogSeat.endDate)}</span>
								</div>
							</div>
						</div>
					) : (
						<p className="text-sm text-muted-foreground">No seat selected.</p>
					)}
				</DialogContent>
			</Dialog>

			<div className="text-xs text-muted-foreground">
				{isPending
					? "Loading updated data..."
					: "Tracker is backed by Prisma + SQLite and recalculates after each import or override."}
			</div>
		</main>
	);
}
