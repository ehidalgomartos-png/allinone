# Instant Admirers V1.12.22

Versión basada en V1.12.21 que añade SEO público transparente a los anfitriones virtuales.

Los perfiles virtuales se pueden descubrir desde `/perfiles/`, aparecen en `sitemap-profiles.xml` y disponen de HTML SEO individual, pero se identifican expresamente como personajes virtuales gestionados por Instant Admirers tanto para visitantes como para buscadores.

La retirada de un anfitrión lo vuelve a excluir automáticamente del SEO porque el sistema conserva `social_hidden=TRUE` para los perfiles retirados.
