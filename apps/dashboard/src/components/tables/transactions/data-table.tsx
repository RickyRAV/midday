"use client";

import { updateColumnVisibilityAction } from "@/actions/update-column-visibility-action";
import { ColumnVisibility } from "@/components/column-visibility";
import { TransactionSheet } from "@/components/sheets/transaction-sheet";
import { createClient } from "@midday/supabase/client";
import { Button } from "@midday/ui/button";
import { Spinner } from "@midday/ui/spinner";
import { Table, TableBody, TableCell, TableRow } from "@midday/ui/table";
import {
  ColumnDef,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { useEffect } from "react";
import { useState } from "react";
import { useInView } from "react-intersection-observer";
import { BottomBar } from "./bottom-bar";
import { DataTableHeader } from "./data-table-header";
import { ExportBar } from "./export-bar";

type Item = {
  id: string;
};

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
}

export function DataTable<TData, TValue>({
  columns,
  data: initialData,
  teamId,
  initialTransactionId,
  pageSize,
  loadMore,
  meta,
  hasFilters,
  hasNextPage: initialHasNextPage,
  initialColumnVisibility,
  page,
}: DataTableProps<TData, TValue>) {
  const supabase = createClient();
  const router = useRouter();
  const [rowSelection, setRowSelection] = useState({});
  const [data, setData] = useState(initialData);
  const [from, setFrom] = useState(pageSize);
  const { ref, inView } = useInView();
  const [hasNextPage, setHasNextPage] = useState(initialHasNextPage);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    initialColumnVisibility ?? {}
  );

  const table = useReactTable({
    getRowId: (row) => row.id,
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      rowSelection,
      columnVisibility,
    },
  });

  const loadMoreData = async () => {
    const formatedFrom = from;
    const to = formatedFrom + pageSize * 2;

    try {
      const { data, meta } = await loadMore({
        from: formatedFrom,
        to,
      });

      setData((prev) => [...prev, ...data]);
      setFrom(to);
      setHasNextPage(meta.count > to);
    } catch {
      setHasNextPage(false);
    }
  };

  const [transactionId, setTransactionId] = useQueryState("id", {
    defaultValue: initialTransactionId,
    shallow: false,
  });

  const selectedTransaction = data.find(
    (transaction) => transaction?.id === transactionId
  );

  const setOpen = (id: string | boolean) => {
    if (id) {
      setTransactionId(id);
    } else {
      setTransactionId(null);
    }
  };

  useEffect(() => {
    updateColumnVisibilityAction({
      key: "transactions-columns",
      data: columnVisibility,
    });
  }, [columnVisibility]);

  useEffect(() => {
    if (inView) {
      loadMoreData();
    }
  }, [inView]);

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  useEffect(() => {
    const currentIndex = data.findIndex((row) => row.id === transactionId);

    const keyDownHandler = (evt: KeyboardEvent) => {
      if (transactionId && evt.key === "ArrowDown") {
        evt.preventDefault();
        const nextItem = data.at(currentIndex + 1);

        if (nextItem) {
          setTransactionId(nextItem.id);
        }
      }

      if (transactionId && evt.key === "Escape") {
        setTransactionId(null);
      }

      if (transactionId && evt.key === "ArrowUp") {
        evt.preventDefault();

        const prevItem = data.at(currentIndex - 1);

        if (currentIndex > 0 && prevItem) {
          setTransactionId(prevItem.id);
        }
      }
    };

    document.addEventListener("keydown", keyDownHandler);

    return () => {
      document.removeEventListener("keydown", keyDownHandler);
    };
  }, [transactionId, data, setTransactionId]);

  useEffect(() => {
    const channel = supabase
      .channel("realtime_transactions")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transactions",
          filter: `team_id=eq.${teamId}`,
        },
        () => {
          router.refresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, router, teamId]);

  return (
    <div className="rounded-md mb-8 relative">
      <div className="absolute -top-[60px] right-0">
        <ColumnVisibility columns={table.getAllLeafColumns()} />
      </div>

      <Table>
        <DataTableHeader table={table} />

        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
                className="h-[45px] cursor-default"
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    onClick={() => {
                      if (cell.column.id !== "select") {
                        setOpen(row.id);
                      }
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {hasNextPage && (
        <div className="flex items-center justify-center mt-6" ref={ref}>
          <Button variant="outline" className="space-x-2 px-6 py-5">
            <Spinner />
            <span className="text-sm text-[#606060]">Loading more...</span>
          </Button>
        </div>
      )}

      <TransactionSheet
        isOpen={Boolean(transactionId)}
        setOpen={setOpen}
        data={selectedTransaction}
        transactionId={transactionId}
      />

      {meta.count > 0 && (
        <BottomBar
          show={hasFilters && !table.getFilteredSelectedRowModel().rows.length}
          page={page}
          count={meta.count}
          hasNextPage={hasNextPage}
          totalAmount={meta.totalAmount}
          currency={meta.currency}
        />
      )}

      <ExportBar
        selected={table.getFilteredSelectedRowModel().rows.length}
        deselectAll={() => table.toggleAllPageRowsSelected(false)}
        transactionIds={Object.keys(rowSelection)}
      />
    </div>
  );
}
