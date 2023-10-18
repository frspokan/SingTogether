using Microsoft.AspNetCore.Mvc;

namespace SingTogether.Controllers
{
    public class EventsController : Controller
    {
        [Route("")]
        [Route("Index")]
        [Route("Index.html")]
        public IActionResult GetIndexPage()
        {
            return NotFound();
        }

        [HttpGet]
        [Route("events")]
        public IActionResult GetEventPage(string eid, string name = null)
        {
            if (string.IsNullOrEmpty(eid))
            {
                return BadRequest();
            }

            return File("~/index.html", "text/html");
        }
    }
}