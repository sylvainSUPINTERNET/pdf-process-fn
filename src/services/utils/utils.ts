// page 1 => page_00000001.pdf
// Why ? because we want to keep the native order of the pages in the blob storage ( based on ASCII )
// if you are using page_1 then page_10 should be next even if you have page_2 ... so it's wrong
export function padPageNumber(pageNumber: number): string {
    return String(pageNumber).padStart(8, '0'); // 8 to be "safe" ( means millions of pages, but we will never reach that number anyway)
}
