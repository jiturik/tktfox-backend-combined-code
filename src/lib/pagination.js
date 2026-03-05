import { winstonLogger } from "./winstonLogger.js";

export function pagination(perPage = 100, currentPage = 1) {
  const paginate = {
    perPage: 100,
    currentPage: 1,
  };

  // Validate and assign currentPage
  const parsedCurrentPage = parseInt(currentPage, 10);
  if (!isNaN(parsedCurrentPage) && parsedCurrentPage > 0) {
    paginate.currentPage = parsedCurrentPage;
  }

  // Validate and assign perPage
  const parsedPerPage = parseInt(perPage, 10);
  if (!isNaN(parsedPerPage) && parsedPerPage > 0) {
    paginate.perPage = parsedPerPage;
  }

  return paginate;
}
