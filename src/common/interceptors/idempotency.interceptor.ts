import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";
import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, from, of } from "rxjs";
import { map, switchMap } from "rxjs/operators";

const IDEMPOTENCY_TTL = 24 * 60 * 60;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest();
    const key = request.headers["idempotency-key"];
    const idempotencyKey = Array.isArray(key) ? key[0] : key;
    const userId = request.user?.id ?? request.user?.wallet;

    if (typeof idempotencyKey !== "string" || !userId) {
      return next.handle();
    }

    const endpoint =
      request.routeOptions?.url ??
      request.route?.path ??
      request.routerPath ??
      request.url.split("?")[0];
    const cacheKey = `idempotency:${userId}:${endpoint}:${idempotencyKey}`;

    return from(this.cacheManager.get(cacheKey)).pipe(
      switchMap((cached) => {
        if (cached === undefined || cached === null) {
          return next
            .handle()
            .pipe(
              switchMap((response) =>
                from(
                  this.cacheManager.set(cacheKey, response, IDEMPOTENCY_TTL),
                ).pipe(map(() => response)),
              ),
            );
        }

        const response = http.getResponse();
        if (typeof response.header === "function") {
          response.header("X-Idempotent-Replayed", "true");
        } else {
          response.setHeader("X-Idempotent-Replayed", "true");
        }
        return of(cached);
      }),
    );
  }
}
