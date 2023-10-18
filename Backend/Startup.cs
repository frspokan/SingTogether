using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using SingTogether.Hubs;

namespace SingTogether
{
    public class Startup
    {
        // This method gets called by the runtime. Use this method to add services to the container.
        // For more information on how to configure your application, visit https://go.microsoft.com/fwlink/?LinkID=398940
        public void ConfigureServices(IServiceCollection services)
        {
            services.AddControllers();
            services.AddSignalR();
            services.AddSingleton<IEventsManager, EventsManager>();

            // // services.AddHttpsRedirection(options =>
            // // {
            // //     options.RedirectStatusCode = StatusCodes.Status307TemporaryRedirect;    // StatusCodes.Status308PermanentRedirect in production
            // //     options.HttpsPort = 443;
            // // });
        }

        // This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
        public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
        {
            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }

            ////app.UseHsts();      // in production (prevents bypassing cert warnings)
            app.UseHttpsRedirection();

            app.UseRouting();

            app.UseEndpoints(endpoints =>
            {
                endpoints.MapControllers();

                endpoints.MapGet("/status", async context =>
                {
                    int count = CommHub.ConnectedCount;
                    var eventsMgr = endpoints.ServiceProvider.GetService<IEventsManager>();
                    string resp = $"Total clients connected: {count}\n{eventsMgr.GetEventsAsString()}";
                    await context.Response.WriteAsync(resp);
                });
                
                endpoints.MapGet("/reset", async context =>
                {
                    // TOOD cleanup old events periodically
                    // Note SignalR auto-removes disconnected users from Groups
                    var eventsMgr = endpoints.ServiceProvider.GetService<IEventsManager>();
                    eventsMgr.ClearEvents();
                    await context.Response.WriteAsync("Reset.");
                });
                
                endpoints.MapHub<CommHub>("/hub");
            });
            
            ////app.UseDefaultFiles();
            app.UseStaticFiles();
        }
    }
}
