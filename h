[1mdiff --git a/src/app/api/vendedores/assign/route.ts b/src/app/api/vendedores/assign/route.ts[m
[1mindex 38b719b..673f4d8 100644[m
[1m--- a/src/app/api/vendedores/assign/route.ts[m
[1m+++ b/src/app/api/vendedores/assign/route.ts[m
[36m@@ -50,6 +50,10 @@[m [mexport async function PATCH(request: NextRequest) {[m
           vendedor: 'LISTA FRIA',[m
           dataAtribuicaoVendedor: null,[m
           dataEntradaBolsao: null,[m
[32m+[m[32m          carteiraLocked: true,[m
[32m+[m[32m          lockedAt: new Date(),[m
[32m+[m[32m          lockedBy: (session.user as any).id,[m
[32m+[m[32m          lockedReason: `Movido para LISTA_FRIA por ${(session.user as any).name}`,[m
         },[m
       })[m
       invalidateCache()[m
[36m@@ -66,6 +70,10 @@[m [mexport async function PATCH(request: NextRequest) {[m
           fornecedor: true,[m
           dataAtribuicaoVendedor: null,[m
           dataEntradaBolsao: null,[m
[32m+[m[32m          carteiraLocked: true,[m
[32m+[m[32m          lockedAt: new Date(),[m
[32m+[m[32m          lockedBy: (session.user as any).id,[m
[32m+[m[32m          lockedReason: `Movido para FORNECEDOR por ${(session.user as any).name}`,[m
         },[m
       })[m
       invalidateCache()[m
[36m@@ -81,6 +89,10 @@[m [mexport async function PATCH(request: NextRequest) {[m
           vendedor: 'BOLSÃO',[m
           dataAtribuicaoVendedor: null,[m
           dataEntradaBolsao: new Date(),[m
[32m+[m[32m          carteiraLocked: true,[m
[32m+[m[32m          lockedAt: new Date(),[m
[32m+[m[32m          lockedBy: (session.user as any).id,[m
[32m+[m[32m          lockedReason: `Movido para BOLSÃO por ${(session.user as any).name}`,[m
         },[m
       })[m
       invalidateCache()[m
[36m@@ -126,6 +138,10 @@[m [mexport async function PATCH(request: NextRequest) {[m
           dataEntradaBolsao: null,[m
           // If was a fornecedor and now assigned to regular vendedor, clear flag[m
           ...(cliente.fornecedor ? { fornecedor: false } : {}),[m
[32m+[m[32m          carteiraLocked: true,[m
[32m+[m[32m          lockedAt: new Date(),[m
[32m+[m[32m          lockedBy: (session.user as any).id,[m
[32m+[m[32m          lockedReason: `Atribuído a ${vendedor.name} por ${(session.user as any).name}`,[m
         },[m
       })[m
     }[m
