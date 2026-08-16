declare module "lucide-react";
declare module "@tanstack/react-query" {
  export function useQuery<TData = any, TError = any>(options: any): any;
  export function useMutation<TData = any, TError = any, TVariables = any>(options: any): any;
  export function useQueryClient(): any;
  export class QueryClient {
    constructor(options?: any);
    invalidateQueries(options?: any): Promise<void>;
  }
  export function QueryClientProvider(props: any): any;
}
